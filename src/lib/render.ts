import type { Fila, Indice, Seccion, UsoDeStack } from './tipos';
import { iconoDe } from '../data/iconos';

// Funciones puras: entran datos, sale HTML. No tocan el DOM ni leen nada.
//
// Por eso las puede usar el frontmatter de una página para el HTML inicial y el
// script de la terminal para la navegación en cliente. Escribir el render dos
// veces es cómo la versión con JavaScript y la versión sin él acaban
// mostrando cosas distintas.

/**
 * Todo lo que venga de los datos pasa por aquí antes de entrar al HTML.
 * Ningún texto es de confianza, ni siquiera el propio: basta un `<` en el
 * título de una publicación para romper la página entera.
 */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Cada fila es un enlace de verdad. Ahí muere la barrera de entrada: quien sabe
 * escribe `cd proyectos`, quien no, hace clic. Mismo destino, misma URL.
 */
export function renderSecciones(secciones: Seccion[]): string {
  const filas = secciones
    .map(
      (s) => `<tr class="row-go">
    <td class="n"><a class="go" href="/${esc(s.slug)}">${esc(s.slug)}/</a></td>
    <td class="c">${s.tipo === 'coleccion' ? s.n : '&mdash;'}</td>
    <td class="d">${esc(s.desc)}</td>
  </tr>`,
    )
    .join('\n');
  return `<table class="list">\n${filas}\n</table>`;
}

/**
 * Un panel con el título encajado en el borde superior: lazygit, btop, k9s.
 * El borde lo dibuja el CSS y no caracteres, para que se pueda seleccionar el
 * texto sin arrastrar la caja.
 */
/**
 * La línea de metadatos de una fila: estado, contexto y el resto de `meta`,
 * en ese orden. El estado va primero, con su propia clase (`estado-<clave>`)
 * para que el CSS lo coloree — es el dato que más cambia entre proyectos, y
 * antes de esto vivía como texto plano dentro de la misma cadena que
 * organización y fecha, sin forma de distinguirlo. El contexto va justo
 * después porque explica de dónde sale ese estado (un proyecto de tesis puede
 * estar «construyendo» igual que uno personal, y sin el contexto al lado esa
 * lectura se pierde). Una publicación no trae `estado`, así que para ella
 * esto se reduce a lo que ya hacía: `meta` tal cual.
 */
function metaDeFila(f: Fila): string {
  const partes: string[] = [];
  if (f.estado) {
    partes.push(`<span class="estado estado-${esc(f.estado.clave)}">${esc(f.estado.etiqueta)}</span>`);
  }
  if (f.contexto) partes.push(esc(f.contexto));
  if (f.meta) partes.push(esc(f.meta));
  return partes.join(' · ');
}

function panel(f: Fila): string {
  const destino = f.href ?? f.externo?.href;
  // f.href es siempre una ruta propia; f.externo?.href (un DOI, cuando la
  // publicación no tiene página propia — ver filaDePublicacion() en
  // src/lib/content.ts) sí puede ser externo, así que se decide con
  // esExterno() y no asumiendo uno de los dos casos.
  const destinoExterno = destino ? esExterno(destino) : false;
  const titulo = destino
    ? `<a class="go" href="${esc(destino)}"${destinoExterno ? ' target="_blank" rel="noopener"' : ''}>${esc(f.titulo)}${destinoExterno ? MARCA_EXTERNA : ''}</a>`
    : esc(f.titulo);

  // Mismo patrón que el título de arriba: una tecnología sin página propia se
  // pinta como texto, no como enlace. La generación de la página es la que
  // manda, no el chip.
  const chips = f.st
    .map((t) =>
      t.href
        ? `<li><a class="chip" href="${esc(t.href)}">${esc(t.tech)}</a></li>`
        : `<li><span class="chip">${esc(t.tech)}</span></li>`,
    )
    .join('');

  const meta = metaDeFila(f);

  return `<article class="panel"${destino ? ' data-go="' + esc(destino) + '"' : ''}>
  <h2 class="panel-t">${titulo}</h2>
  ${meta ? `<p class="panel-m">${meta}</p>` : ''}
  <p class="panel-d">${esc(f.desc)}</p>
  ${chips ? `<ul class="chips">${chips}</ul>` : ''}
</article>`;
}

export function renderEntradas(filas: Fila[]): string {
  if (filas.length === 0) {
    return `<div class="out fg-dim"># todavía no hay nada acá</div>`;
  }
  return `<div class="panels">\n${filas.map(panel).join('\n')}\n</div>`;
}

/**
 * El número y su evidencia van juntos siempre. Un stack que solo muestra
 * cuentas es un stack que hay que creer; este se puede comprobar (la
 * evidencia vive en la página de cada tecnología, enlazada desde su celda).
 *
 * Es una cuadrícula, no una lista de filas: 29 tecnologías con una barra cada
 * una crecían 29 filas hacia abajo sin decir nada que valiera la pena — 24
 * tenían 1 uso y 5 tenían 2, así que casi todas las barras medían lo mismo.
 * Acá el color codifica el número de usos, pero nunca es la única forma de
 * leerlo: el número también queda escrito dentro de la celda (WCAG 1.4.1, «no
 * solo color»). El nivel es absoluto —`min(usos, 5)`—, no relativo al máximo
 * de hoy: así el mapa no se recolorea entero la próxima vez que se agregue un
 * proyecto, y una celda con 2 usos ya se pinta en su lugar final de la escala.
 */
export function renderStack(stack: UsoDeStack[], minimoParaPagina = 2): string {
  const celdas = stack
    .map((s) => {
      const nivel = Math.min(s.usos, 5);
      const conPagina = s.usos >= minimoParaPagina;
      const nombre = esc(s.tech);
      const texto = `${s.usos} ${s.usos === 1 ? 'uso' : 'usos'}`;

      // aria-hidden: el icono es decorativo y su nombre ya está al lado. Un
      // lector de pantalla leería el codepoint del Área de Uso Privado, que no
      // significa nada.
      const icono = `<span class="ico" aria-hidden="true">${esc(iconoDe(s.tech))}</span>`;
      const contenido = `${icono}<span class="stack-nombre">${nombre}</span><span class="stack-usos">${texto}</span>`;

      // Mismo criterio que panel()/chip: una tecnología sin página propia se
      // pinta como texto, no como enlace. El nombre accesible del enlace lleva
      // el número adentro para que no haga falta ver el color de fondo para
      // saber cuántos usos tiene.
      const celda = conPagina
        ? `<a class="stack-celda nivel-${nivel}" href="/stack/${esc(slugTech(s.tech))}" aria-label="${nombre}, ${texto}">${contenido}</a>`
        : `<div class="stack-celda nivel-${nivel}">${contenido}</div>`;

      return `<li>${celda}</li>`;
    })
    .join('\n');

  // La leyenda no es decorativa: sin ella el color no dice nada para quien no
  // memorizó la escala. Su texto va en un token de texto, nunca en el color de
  // la propia serie — el mismo criterio que un gráfico normal.
  const leyenda = [1, 2, 3, 4, 5]
    .map((n) => {
      const etiqueta = n === 5 ? '5+' : String(n);
      const texto = `${etiqueta} ${n === 1 ? 'uso' : 'usos'}`;
      return `<li><span class="stack-swatch nivel-${n}" aria-hidden="true"></span><span class="stack-leyenda-t">${texto}</span></li>`;
    })
    .join('');

  return `<ul class="stack-heat">\n${celdas}\n</ul>\n<ul class="stack-leyenda">${leyenda}</ul>`;
}

/**
 * La ruta de un archivo del CMS (`archivo` de una certificación, `foto` del
 * perfil), lista para un atributo href/src/data. El dueño sube el archivo con
 * su nombre real —con espacios, acentos, lo que sea— y un espacio crudo en la
 * URL corta la petición ahí mismo. Si la ruta ya trae un '%XX' se deja tal
 * cual: volver a codificarla la rompería (un '%' se convertiría en '%25').
 */
export function rutaMedia(ruta: string): string {
  return /%[0-9a-fA-F]{2}/.test(ruta) ? ruta : encodeURI(ruta);
}

/** El identificador de una tecnología en una URL. */
export function slugTech(tech: string): string {
  return tech
    .toLowerCase()
    .normalize('NFD')
    // Los diacríticos, como escape: crudos son invisibles en el editor.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── Enlaces externos ─────────────────────────────────────────────────────
//
// Quien sale del sitio en la misma pestaña no siempre vuelve. La regla es del
// host, no del protocolo ni de la ruta: mailto:/tel: no tienen host que
// comparar (y target="_blank" ahí deja una pestaña en blanco huérfana en
// varios navegadores), y una ruta interna (/proyectos, #ancla, relativa)
// tampoco entra, porque nunca empieza con http(s). Un enlace a /media/ (PDF o
// imagen del propio dueño) tampoco es "externo" en este sentido, aunque ya
// abra en pestaña nueva por su cuenta: esa es la puerta del visor flotante
// (Visor.astro / scripts/visor.ts), una decisión aparte y anterior a esta.
//
// Esta es la única definición de "externo" del lado de Astro (usada por
// panel() y renderContacto(), abajo, y por cada página bajo src/pages que
// arma su propio enlace). El plugin rehype (src/lib/rehype-figuras.mjs)
// repite el mismo criterio en vez de importar de acá: corre en su propio
// proceso de Node, fuera del pipeline de Vite/Astro, igual que ya explica el
// propio archivo para rutaMedia().

/** El host propio del sitio: mismo valor que `site` en astro.config.mjs. Se
 * repite acá porque ese archivo es configuración de Astro, no algo que este
 * módulo importe. */
export const HOST_PROPIO = 'jbmllnube.com';

export function esExterno(href: string): boolean {
  if (!/^https?:\/\//i.test(href)) return false;
  try {
    return new URL(href).host !== HOST_PROPIO;
  } catch {
    // Una URL que no se puede parsear no es un destino externo real: es un
    // dato roto, y ya lo denuncia otra comprobación (el esquema de Zod exige
    // z.url() en todo campo que termina siendo un href).
    return false;
  }
}

/** El anuncio accesible de que el enlace abre en una pestaña nueva: un
 * sufijo visual (↗, en la línea de las flechas que ya usa el sitio — el "←"
 * de stack/[tech].astro) con su propio texto para quien no lo ve. Va DENTRO
 * del `<a>` —no suelto al lado— para que un lector de pantalla lo anuncie
 * como parte del propio enlace y no como una nota que nunca alcanza a leer
 * (WCAG 3.2.5: un cambio de contexto se anuncia antes de que ocurra). HTML de
 * confianza, sin datos del usuario adentro, así que no pasa por esc().
 * También se usa desde JSX (contacto.astro, sobre-mi.astro) con
 * `<Fragment set:html={MARCA_EXTERNA} />`, para no repetir este marcado ahí. */
export const MARCA_EXTERNA =
  '<span class="externo" aria-hidden="true"> ↗</span><span class="sr-only"> (se abre en una pestaña nueva)</span>';

/** target/rel para un enlace externo, listos para un spread de props JSX
 * (`<a {...propsExterno(href)}>`). Un enlace que no es externo no recibe
 * ninguno de los dos: no hace falta "apagar" nada porque nunca se puso.
 * `relExtra` es cualquier rel que el enlace ya necesite por su cuenta —
 * "me" en un enlace de identidad (ver renderContacto())—, y se le suma
 * "noopener" en vez de reemplazarlo. */
export function propsExterno(href: string, relExtra?: string): { target?: '_blank'; rel?: string } {
  if (!esExterno(href)) return {};
  return { target: '_blank', rel: [relExtra, 'noopener'].filter(Boolean).join(' ') };
}

export interface EnlaceDeContacto {
  etiqueta: string;
  href: string;
  texto?: string;
}

export function renderContacto(enlaces: EnlaceDeContacto[]): string {
  const filas = enlaces
    .map((e) => {
      // rel="me" declara que el perfil del otro extremo es el mismo de aquí:
      // se conserva tal cual, y esExterno() decide, además, si suma
      // target="_blank"/noopener y el anuncio de pestaña nueva. mailto: no es
      // externo (no tiene host que comparar), así que sigue navegando en la
      // misma pestaña, como siempre.
      const externo = esExterno(e.href);
      const rel = externo ? ' rel="me noopener" target="_blank"' : '';
      const marca = externo ? MARCA_EXTERNA : '';
      return `<tr>
    <td class="n">${esc(e.etiqueta)}</td>
    <td class="d"><a class="go" href="${esc(e.href)}"${rel}>${esc(e.texto ?? e.href)}${marca}</a></td>
  </tr>`;
    })
    .join('\n');
  return `<table class="list">\n${filas}\n</table>`;
}

/** La salida inicial de una URL: lo que la terminal ya tendría en pantalla. */
export function renderSalida(indice: Indice, seccion: string | null): string {
  if (!seccion) return renderSecciones(indice.secciones);
  const filas = indice.entradas[seccion];
  if (!filas) return `<div class="out fg-red">cd: ${esc(seccion)}: no existe</div>`;
  return renderEntradas(filas);
}
