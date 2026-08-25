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
function panel(f: Fila): string {
  const destino = f.href ?? f.externo?.href;
  const titulo = destino
    ? `<a class="go" href="${esc(destino)}">${esc(f.titulo)}</a>`
    : esc(f.titulo);

  const chips = f.st
    .map((t) => `<li><a class="chip" href="/stack/${esc(slugTech(t))}">${esc(t)}</a></li>`)
    .join('');

  return `<article class="panel"${destino ? ' data-go="' + esc(destino) + '"' : ''}>
  <h2 class="panel-t">${titulo}</h2>
  ${f.meta ? `<p class="panel-m">${esc(f.meta)}</p>` : ''}
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
 * cuentas es un stack que hay que creer; este se puede comprobar.
 */
export function renderStack(stack: UsoDeStack[], minimoParaPagina = 2): string {
  // La barra mide usos contados, no dominio autodeclarado. Un porcentaje de
  // «nivel» no sale de ningún dato: lo pone quien escribe y nadie puede
  // comprobarlo. Esto sí — cada barra enlaza a dónde se usó.
  const tope = Math.max(1, ...stack.map((s) => s.usos));

  const filas = stack
    .map((s) => {
      const conPagina = s.usos >= minimoParaPagina;
      const url = `/stack/${esc(slugTech(s.tech))}`;
      const nombre = conPagina
        ? `<a class="go" href="${url}">${esc(s.tech)}</a>`
        : esc(s.tech);

      // aria-hidden: el icono es decorativo y su nombre ya está al lado. Un
      // lector de pantalla leería el codepoint del Área de Uso Privado, que no
      // significa nada.
      const icono = `<span class="ico" aria-hidden="true">${esc(iconoDe(s.tech))}</span>`;
      const barra = '█'.repeat(Math.max(1, Math.round((s.usos / tope) * 8)));
      const fuentes = s.fuentes.map((f) => esc(f.titulo)).join(' · ');

      return `<tr>
    <td class="n">${icono}${nombre}</td>
    <td class="bar" title="${s.usos} ${s.usos === 1 ? 'uso' : 'usos'}">${barra}</td>
    <td class="c">${s.usos}</td>
    <td class="d">${fuentes}</td>
  </tr>`;
    })
    .join('\n');

  return `<table class="list stack">\n${filas}\n</table>`;
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

export interface EnlaceDeContacto {
  etiqueta: string;
  href: string;
  texto?: string;
}

export function renderContacto(enlaces: EnlaceDeContacto[]): string {
  const filas = enlaces
    .map((e) => {
      // rel="me" declara que el perfil del otro extremo es el mismo de aquí.
      // Los enlaces salientes llevan noopener por costumbre, no por necesidad:
      // ninguno abre en pestaña nueva, pero el día que uno lo haga ya está.
      const externo = e.href.startsWith('http');
      const rel = externo ? ' rel="me noopener"' : '';
      return `<tr>
    <td class="n">${esc(e.etiqueta)}</td>
    <td class="d"><a class="go" href="${esc(e.href)}"${rel}>${esc(e.texto ?? e.href)}</a></td>
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
