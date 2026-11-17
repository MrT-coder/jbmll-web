import { ETIQUETAS_CV, type EtiquetasCv } from '../i18n/cv';
import { CATEGORIA_RESTO, ORDEN_CATEGORIAS, categoriaDe } from '../data/categorias-stack';
import {
  getCertificaciones,
  getEducacion,
  getExperiencia,
  getPerfil,
  getProyectos,
  getPublicaciones,
  getStack,
  type Idioma,
} from './content';

// El CV como datos, sin formato. Sale de las mismas colecciones que la web: ni
// un dato vive solo aquí. Quien lo dibuja (cv-pdf.ts) no sabe de colecciones, y
// este módulo no sabe de PDF; por eso se puede comprobar por separado que el CV
// dice lo mismo que el sitio.

export interface CvEntrada {
  titulo: string;
  /** Segunda línea: organización, lugar y fechas, ya formateados. */
  detalle: string;
  puntos: string[];
  stack: string[];
  /** Enlaces del proyecto (demo, repositorio), solo los que existen. */
  enlaces: { etiqueta: string; url: string }[];
}

export interface Cv {
  lang: Idioma;
  etiquetas: EtiquetasCv;
  nombre: string;
  titular: string;
  ubicacion: string;
  contacto: string[];
  resumen: string | undefined;
  habilidades: { categoria: string; items: string[] }[];
  experiencia: CvEntrada[];
  proyectos: CvEntrada[];
  publicaciones: string[];
  educacion: { titulo: string; detalle: string }[];
  certificaciones: string[];
  idiomas: string[];
}

/** AAAA-MM → «Sep 2025»; AAAA → «2025». */
export function formatoMes(mes: string, meses: string[]): string {
  const [anio, m] = mes.split('-');
  return m ? `${meses[Number(m) - 1]} ${anio}` : anio;
}

function periodo(inicio: string, fin: string | undefined, e: EtiquetasCv): string {
  return `${formatoMes(inicio, e.meses)} – ${fin ? formatoMes(fin, e.meses) : e.presente}`;
}

/**
 * Los párrafos del cuerpo de una entrada, como texto plano. Un CV se lee en
 * puntos y un ATS no entiende Markdown: se quitan negritas, código, enlaces,
 * títulos e imágenes y queda lo que dice cada párrafo.
 */
export function parrafosPlanos(cuerpo: string | undefined): string[] {
  return (cuerpo ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !/^(#|!\[|>|-{3,}|\|)/.test(p))
    .map((p) =>
      p
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/(\*\*|__)(.+?)\1/g, '$2')
        .replace(/(\*|_)(.+?)\1/g, '$2')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
}

export async function armarCv(lang: Idioma): Promise<Cv> {
  const e = ETIQUETAS_CV[lang];
  const [perfil, stack, experiencia, proyectos, publicaciones, educacion, certificaciones] =
    await Promise.all([
      getPerfil(lang),
      getStack(lang),
      getExperiencia(lang),
      getProyectos(lang),
      getPublicaciones(lang),
      getEducacion(lang),
      getCertificaciones(lang),
    ]);

  // Habilidades: el stack calculado, repartido en cajones. El orden dentro de
  // cada cajón es por frecuencia de uso, que ya trae getStack().
  const cajones = new Map<string, string[]>();
  for (const { tech } of stack) {
    const cat = categoriaDe(tech);
    cajones.set(cat, [...(cajones.get(cat) ?? []), tech]);
  }
  const habilidades = ORDEN_CATEGORIAS.filter((c) => cajones.has(c)).map((c) => ({
    categoria: e.categorias[c] ?? e.categorias[CATEGORIA_RESTO],
    items: cajones.get(c)!,
  }));

  const proyectoPorId = new Map(proyectos.map((p) => [p.id, p]));

  const entradasDeExperiencia: CvEntrada[] = experiencia.map((x) => {
    const parrafos = parrafosPlanos(x.body);
    const enlazado = x.data.proyecto ? proyectoPorId.get(x.data.proyecto) : undefined;
    return {
      titulo: `${x.data.puesto} — ${x.data.organizacion}`,
      detalle: [
        x.data.modalidad ? `${x.data.ubicacion} (${x.data.modalidad})` : x.data.ubicacion,
        periodo(x.data.inicio, x.data.fin, e),
      ].join(' · '),
      // Un puesto que enlaza a un proyecto dice en su segundo párrafo «el
      // trabajo está descrito en el proyecto»: en la web es un puente, en un
      // CV de una sola página sería una referencia a otra sección. Solo pasa
      // el primero; el resto vive en Proyectos.
      puntos: x.data.proyecto ? parrafos.slice(0, 1) : parrafos,
      stack: enlazado ? enlazado.data.st : x.data.st,
      enlaces: [],
    };
  });

  const entradasDeProyecto: CvEntrada[] = proyectos
    .filter((p) => p.data.cv.length > 0)
    .map((p) => ({
      titulo: p.data.titulo,
      detalle: [p.data.organizacion, formatoMes(p.data.fecha, e.meses)].filter(Boolean).join(' · '),
      puntos: p.data.cv,
      stack: p.data.st,
      enlaces: [
        p.data.demo ? { etiqueta: e.demo, url: p.data.demo } : null,
        p.data.repo ? { etiqueta: e.repo, url: p.data.repo } : null,
      ].filter((x): x is { etiqueta: string; url: string } => x !== null),
    }));

  const refs = publicaciones.map((p) => {
    const partes = [
      p.data.autores.join(', '),
      `(${p.data.anio}).`,
      `${p.data.titulo}.`,
      [p.data.venue, p.data.serie, p.data.paginas && `pp. ${p.data.paginas}`].filter(Boolean).join(', ') + '.',
      p.data.editorial && `${p.data.editorial}.`,
      p.data.doi && `DOI: ${p.data.doi}`,
    ];
    return partes.filter(Boolean).join(' ');
  });

  return {
    lang,
    etiquetas: e,
    nombre: perfil.nombre,
    titular: perfil.titular,
    ubicacion: `${perfil.ubicacion} (${perfil.disponibilidad})`,
    contacto: perfil.contacto.map((c) => `${e.contacto[c.etiqueta] ?? c.etiqueta}: ${c.texto ?? c.href}`),
    resumen: perfil.resumen,
    habilidades,
    experiencia: entradasDeExperiencia,
    proyectos: entradasDeProyecto,
    publicaciones: refs,
    educacion: educacion.map((x) => ({
      titulo: `${x.data.titulo} — ${x.data.institucion}, ${x.data.ubicacion}`,
      detalle: [periodo(x.data.inicio, x.data.fin, e), x.data.registro && `${e.registro}: ${x.data.registro}`]
        .filter(Boolean)
        .join(' · '),
    })),
    certificaciones: certificaciones.map((c) =>
      [
        c.data.nombre,
        c.data.emisor,
        c.data.fecha && formatoMes(c.data.fecha, e.meses),
        c.data.horas && `${c.data.horas} ${e.horas}`,
        c.data.credencial && `${e.credencial}: ${c.data.credencial}`,
      ]
        .filter(Boolean)
        .join(' — '),
    ),
    idiomas: perfil.idiomas.map((i) => `${i.idioma}: ${i.nivel}`),
  };
}
