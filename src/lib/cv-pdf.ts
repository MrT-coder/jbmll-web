import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Cv, CvEntrada } from './cv';

// Dibuja un Cv como PDF. Reglas heredadas de md2cv.py (la carpeta cveate),
// porque cada una existe por un fallo real de un ATS:
//   - una sola columna, sin tablas ni cuadros de texto: un ATS lee en orden de
//     flujo y una segunda columna le revuelve las secciones;
//   - texto real con una fuente incrustada: así el PDF se copia y se busca;
//   - una página tamaño Letter con márgenes de 15 mm;
//   - los DOI en su propia línea y sin cortar, para que sigan siendo copiables;
//   - sin una última página con dos líneas sueltas: si pasa, se aprieta la
//     escala y se vuelve a dibujar.
// Todo corre en el build, en Node, sin navegador: Cloudflare no tiene Chrome.

const require = createRequire(import.meta.url);

// Un solo punto de entrada a pdfmake para no repetir la configuración.
function pdfmake() {
  const pm = require('pdfmake');
  const raiz = join(dirname(require.resolve('pdfmake')), '..');
  const roboto = (f: string) => join(raiz, 'fonts', 'Roboto', f);
  pm.setFonts({
    Roboto: {
      normal: roboto('Roboto-Regular.ttf'),
      bold: roboto('Roboto-Medium.ttf'),
      italics: roboto('Roboto-Italic.ttf'),
      bolditalics: roboto('Roboto-MediumItalic.ttf'),
    },
  });
  // El CV no descarga nada ni lee nada fuera de sus fuentes: se cierra lo demás.
  pm.setUrlAccessPolicy(() => false);
  pm.setLocalAccessPolicy((ruta: string) => ruta.startsWith(join(raiz, 'fonts')));
  return pm;
}

const MARGEN_LATERAL = 42.5; // 15 mm
const GRIS = '#444444';

type Nodo = Record<string, unknown>;

function seccion(titulo: string, k: number): Nodo[] {
  return [
    {
      text: titulo.toUpperCase(),
      fontSize: 11 * k,
      bold: true,
      characterSpacing: 0.6,
      margin: [0, 11 * k, 0, 2],
      // Que un título no quede huérfano al final de una página.
      keepWithNext: true,
    },
    {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: 612 - MARGEN_LATERAL * 2, y2: 0, lineWidth: 0.8, lineColor: '#999999' }],
      margin: [0, 0, 0, 5],
      keepWithNext: true,
    },
  ];
}

function entrada(x: CvEntrada, e: string, k: number): Nodo[] {
  const salida: Nodo[] = [
    { text: x.titulo, bold: true, fontSize: 10.5 * k, margin: [0, 6 * k, 0, 0], keepWithNext: true },
    { text: x.detalle, italics: true, color: GRIS, fontSize: 9 * k, margin: [0, 0, 0, 2], keepWithNext: x.puntos.length > 0 },
  ];
  if (x.puntos.length) salida.push({ ul: x.puntos, margin: [0, 0, 0, 2], markerColor: '#1a1a1a' });
  if (x.stack.length) {
    salida.push({
      text: [{ text: `${e}: `, bold: true }, x.stack.join(', ')],
      fontSize: 9 * k,
      margin: [0, 0, 0, 3],
    });
  }
  return salida;
}

function documento(cv: Cv, k: number): { definicion: Nodo; ultimaPaginaHuerfana: () => boolean } {
  const e = cv.etiquetas;
  // La altura que ocupa cada página, medida por el último nodo que cae en ella.
  const alturaPorPagina = new Map<number, number>();
  let ultima = 1;

  const contenido: Nodo[] = [
    { text: cv.nombre, fontSize: 19 * k, bold: true, margin: [0, 0, 0, 2] },
    { text: cv.titular, fontSize: 11.5 * k, color: '#333333', margin: [0, 0, 0, 4] },
    { text: cv.ubicacion, fontSize: 9 * k, color: GRIS },
    ...cv.contacto.map((linea) => ({ text: linea, fontSize: 9 * k, color: GRIS })),
  ];

  if (cv.resumen) contenido.push(...seccion(e.perfil, k), { text: cv.resumen, alignment: 'left' });

  if (cv.habilidades.length) {
    contenido.push(
      ...seccion(e.habilidades, k),
      {
        ul: cv.habilidades.map((h) => ({
          text: [{ text: `${h.categoria}: `, bold: true }, h.items.join(', ')],
        })),
      },
    );
  }

  if (cv.experiencia.length) {
    contenido.push(...seccion(e.experiencia, k), ...cv.experiencia.flatMap((x) => entrada(x, e.stack, k)));
  }
  if (cv.proyectos.length) {
    contenido.push(...seccion(e.proyectos, k), ...cv.proyectos.flatMap((x) => entrada(x, e.stack, k)));
  }
  if (cv.publicaciones.length) {
    contenido.push(...seccion(e.publicaciones, k));
    for (const ref of cv.publicaciones) {
      // El DOI va aparte y sin cortar: dentro de un párrafo se parte en los
      // guiones y deja de poder copiarse.
      const i = ref.lastIndexOf(' DOI: ');
      const cuerpo = i === -1 ? ref : ref.slice(0, i);
      const doi = i === -1 ? undefined : ref.slice(i + 1);
      contenido.push({ text: cuerpo, margin: [0, 0, 0, doi ? 0 : 4] });
      if (doi) contenido.push({ text: doi, noWrap: true, margin: [0, 0, 0, 4] });
    }
  }
  if (cv.educacion.length) {
    contenido.push(
      ...seccion(e.educacion, k),
      ...cv.educacion.flatMap((x) => [
        { text: x.titulo, bold: true, keepWithNext: true },
        { text: x.detalle, italics: true, color: GRIS, fontSize: 9 * k, margin: [0, 0, 0, 3] },
      ]),
    );
  }
  if (cv.certificaciones.length) contenido.push(...seccion(e.certificaciones, k), { ul: cv.certificaciones });
  if (cv.idiomas.length) contenido.push(...seccion(e.idiomas, k), { ul: cv.idiomas });

  return {
    definicion: {
      info: { title: `${cv.nombre} — CV`, author: cv.nombre, language: cv.lang },
      pageSize: 'LETTER',
      pageMargins: [MARGEN_LATERAL, 37 * k, MARGEN_LATERAL, 37 * k],
      defaultStyle: { font: 'Roboto', fontSize: 10 * k, lineHeight: 1.22 * k, color: '#1a1a1a' },
      content: contenido,
      // pdfmake llama aquí antes de colocar cada nodo; sirve para saber qué
      // tan llena queda la última página sin leer el PDF de vuelta.
      pageBreakBefore: (actual: { startPosition?: { pageNumber?: number; verticalRatio?: number } }) => {
        const p = actual.startPosition?.pageNumber ?? 1;
        const r = actual.startPosition?.verticalRatio ?? 0;
        ultima = Math.max(ultima, p);
        alturaPorPagina.set(p, Math.max(alturaPorPagina.get(p) ?? 0, r));
        return false;
      },
    },
    // «Huérfana»: más de una página y la última no llega al 25 % de su altura.
    ultimaPaginaHuerfana: () => ultima > 1 && (alturaPorPagina.get(ultima) ?? 1) < 0.25,
  };
}

/** Escalas a probar, de la normal a la más apretada (las mismas de md2cv.py). */
const ESCALAS = [1, 0.97, 0.94, 0.91];

export async function renderizarCv(cv: Cv): Promise<Buffer> {
  const pm = pdfmake();
  let buffer: Buffer | undefined;
  for (const k of ESCALAS) {
    const { definicion, ultimaPaginaHuerfana } = documento(cv, k);
    buffer = Buffer.from(await pm.createPdf(definicion).getBuffer());
    if (!ultimaPaginaHuerfana()) break;
  }
  return buffer as Buffer;
}
