// Convierte cada imagen del cuerpo en Markdown en una figura con pie, al
// estilo de un artículo largo (la referencia que trajo el dueño fue una
// captura de Medium): <figure> agrupa la imagen y su leyenda para quien usa
// un lector de pantalla, y el pie visible sale del argumento de título de
// Markdown — `![texto alternativo](/media/x.png "pie visible")`. El corchete
// se queda como alt (accesibilidad), la comilla se vuelve <figcaption>
// (lectura visual). Sin comilla, no hay <figcaption> vacío.
//
// También marca, con el mismo mecanismo, todo enlace a un PDF propio bajo
// /media/: lo abre el visor flotante (Visor.astro + scripts/visor.ts), ya
// construido para los certificados — nada de esto crea un segundo visor. Y
// marca, aparte, todo enlace a un sitio ajeno (esExterno()) para que se abra
// en pestaña nueva sin perder a quien leía: mismo criterio y mismo anuncio
// accesible (MARCA_EXTERNA) que ya usan las páginas .astro del sitio, ver
// src/lib/render.ts.
//
// Se conecta desde astro.config.mjs (`markdown.rehypePlugins`) y opera sobre
// el árbol HTML (hast) que Astro ya arma a partir del Markdown, después de
// remark-rehype: no hace falta ningún analizador de Markdown propio.
//
// Sin dependencia nueva: el recorrido del árbol es una recursión de pocas
// líneas — unist-util-visit ya vive en node_modules como dependencia
// transitiva de Astro, pero no está declarada en package.json, así que no es
// un contrato estable en el que apoyarse — y la lectura de dimensiones repite
// a propósito el mismo patrón que ya usa src/components/Terminal.astro: leer
// el encabezado real del archivo (el marcador SOF del JPEG, la cabecera IHDR
// del PNG) en vez de inventar un tamaño.
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

/** Mismo criterio que rutaMedia() en src/lib/render.ts (repetido también en
 * scripts/verify.mjs, por la misma razón: cada uno corre en su propio
 * proceso de build): una ruta que ya trae un '%XX' se deja tal cual, para no
 * codificarla dos veces. */
function rutaMedia(ruta) {
  return /%[0-9a-fA-F]{2}/.test(ruta) ? ruta : encodeURI(ruta);
}

/** Mismo criterio que esExterno() en src/lib/render.ts, repetido acá por la
 * misma razón que rutaMedia(), arriba: este módulo corre en su propio
 * proceso de Node desde astro.config.mjs, fuera del pipeline de Vite/Astro,
 * así que no puede importar un .ts. Un enlace del cuerpo en Markdown es
 * externo cuando es http(s) y su host no es el propio — un enlace a /media/
 * (ya cubierto arriba, marcarSiEsPdfLocal) nunca entra acá, porque nunca
 * empieza con http(s). */
const HOST_PROPIO = 'jbmllnube.com';
function esExterno(href) {
  if (!/^https?:\/\//i.test(href)) return false;
  try {
    return new URL(href).host !== HOST_PROPIO;
  } catch {
    return false;
  }
}

/** El mismo anuncio accesible que MARCA_EXTERNA en src/lib/render.ts (mismo
 * porqué ahí: WCAG 3.2.5, adentro del `<a>` para que un lector de pantalla lo
 * anuncie como parte del propio enlace). Acá se arma como nodos hast en vez
 * de una cadena, porque este árbol nunca se serializa a mano: lo serializa
 * Astro más adelante en el pipeline. */
function nodosMarcaExterna() {
  return [
    {
      type: 'element',
      tagName: 'span',
      properties: { className: ['externo'], 'aria-hidden': 'true' },
      children: [{ type: 'text', value: ' ↗' }],
    },
    {
      type: 'element',
      tagName: 'span',
      properties: { className: ['sr-only'] },
      children: [{ type: 'text', value: ' (se abre en una pestaña nueva)' }],
    },
  ];
}

const esLocal = (src) => src.startsWith('/media/');

// Copiado (no reutilizado como función compartida) de Terminal.astro a
// propósito: ese componente lee el tamaño de una única foto de perfil,
// siempre JPEG, dentro del render de un .astro. Este módulo lo usa Node
// directamente desde astro.config.mjs y atiende cualquier imagen que el
// dueño suba desde /admin, así que también entiende PNG — pero es la misma
// idea: leer el archivo, no confiar en nada que alguien haya escrito a mano.
function tamanoJpeg(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marcador = buf[i + 1];
    if (marcador === 0xd8 || marcador === 0xd9) {
      i += 2;
      continue;
    }
    if (marcador >= 0xd0 && marcador <= 0xd7) {
      i += 2;
      continue;
    }
    const largo = buf.readUInt16BE(i + 2);
    const esSOF =
      (marcador >= 0xc0 && marcador <= 0xc3) ||
      (marcador >= 0xc5 && marcador <= 0xc7) ||
      (marcador >= 0xc9 && marcador <= 0xcb) ||
      (marcador >= 0xcd && marcador <= 0xcf);
    if (esSOF) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    i += 2 + largo;
  }
  return null;
}

// La cabecera de un PNG es fija: firma de 8 bytes y el primer chunk siempre
// es IHDR, con el ancho y el alto como los primeros ocho bytes de sus datos
// (después de los 4 de longitud y los 4 del tipo "IHDR" del propio chunk).
function tamanoPng(buf) {
  const firmaOk =
    buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (!firmaOk) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function tamanoReal(rutaAbsoluta) {
  const buf = readFileSync(rutaAbsoluta);
  const ext = extname(rutaAbsoluta).toLowerCase();
  if (ext === '.png') return tamanoPng(buf);
  if (ext === '.jpg' || ext === '.jpeg') return tamanoJpeg(buf);
  return null;
}

/** El texto plano de un nodo hast, recorriendo sus hijos: es el nombre
 * accesible ya escrito del enlace, el que usa quien lee sin imágenes. */
function textoDe(nodo) {
  if (nodo.type === 'text') return nodo.value;
  if (!Array.isArray(nodo.children)) return '';
  return nodo.children.map(textoDe).join('');
}

const esBlancoOVacio = (nodo) => nodo.type === 'text' && /^\s*$/.test(nodo.value);

/**
 * Una imagen (hast `img`) se convierte en `<figure class="figura">`: la
 * imagen queda envuelta en un enlace real al propio archivo — funciona sin
 * JavaScript por ser un enlace, y scripts/visor.ts la abre en grande al
 * pulsarla, igual que ya hace con el archivo de una certificación — y,
 * cuando el Markdown trae el argumento de título, un <figcaption> con ese
 * texto exacto.
 */
function crearFigura(img) {
  const props = img.properties ?? {};
  const src = String(props.src ?? '');
  const alt = typeof props.alt === 'string' ? props.alt : '';
  const pie = typeof props.title === 'string' && props.title.length > 0 ? props.title : undefined;

  // El alt vacío (`![]()`) es un defecto de accesibilidad real en una imagen
  // de contenido — a diferencia de un icono decorativo, esta imagen no tiene
  // ningún texto al lado que la describa — y el dueño lo escribe a mano
  // desde el panel. Se rompe el build acá, en el mismo espíritu que
  // Terminal.astro ya rompe el suyo por un formato de foto que no sabe medir:
  // un error explícito en el build, en vez de servir una imagen muda que
  // nadie audita hasta que alguien la topa con un lector de pantalla.
  if (alt.trim().length === 0) {
    throw new Error(
      `rehype-figuras: falta el texto alternativo de la imagen «${src}». ` +
        `Escribe ![texto alternativo](${src}${pie ? ` "${pie}"` : ''}).`,
    );
  }

  const local = esLocal(src);
  let width;
  let height;
  if (local) {
    // decodeURI y no la ruta cruda: el Markdown puede traer un espacio ya
    // codificado (%20) o uno crudo, y el archivo en disco vive con su nombre
    // real, sin codificar — mismo criterio que scripts/verify.mjs al resolver
    // una ruta /media/ contra dist/.
    const relativa = decodeURI(src).replace(/^\/media\//, '');
    const rutaAbsoluta = join(process.cwd(), 'public', 'media', relativa);
    const tam = tamanoReal(rutaAbsoluta);
    if (!tam) {
      throw new Error(
        `rehype-figuras: no se pudo leer el tamaño real de «${src}» (solo se ` +
          `entienden PNG y JPEG — igual que la foto de perfil en Terminal.astro).`,
      );
    }
    width = tam.width;
    height = tam.height;
  }
  // Una URL absoluta (el día que el dueño mueva medios a Cloudflare R2) no
  // tiene un archivo local que leer: se sirve sin width/height en vez de
  // adivinar un tamaño, que es peor que no declarar ninguno.

  const href = local ? rutaMedia(src) : src;
  // El pie, si existe, es lo que más dice del contenido de la imagen; a
  // falta de él, el alt es lo único que hay. Es lo que ve el panel del
  // visor como título y lo que anuncia el enlace que lo abre.
  const nombreVisor = pie ?? alt;

  const imgNode = {
    type: 'element',
    tagName: 'img',
    properties: {
      src: href,
      alt,
      loading: 'lazy',
      decoding: 'async',
      ...(width && height ? { width, height } : {}),
    },
    children: [],
  };

  const enlaceNode = {
    type: 'element',
    tagName: 'a',
    properties: {
      href,
      className: ['visor-abrir'],
      'data-nombre': nombreVisor,
      // El nombre accesible del disparador no puede ser el alt a secas: sin
      // esto, un lector de pantalla anuncia solo la descripción de la
      // imagen y no dice que el enlace la abre en grande.
      'aria-label': `ver la imagen en grande: ${nombreVisor}`,
      // Mismo par que ya usa el enlace [ver] de una certificación
      // (sobre-mi.astro): sin JavaScript, el clic abre el archivo en una
      // pestaña nueva en vez de navegar fuera del artículo que se leía.
      target: '_blank',
      rel: ['noopener'],
    },
    children: [imgNode],
  };

  const hijos = [enlaceNode];
  if (pie) {
    hijos.push({
      type: 'element',
      tagName: 'figcaption',
      properties: {},
      children: [{ type: 'text', value: pie }],
    });
  }

  return {
    type: 'element',
    tagName: 'figure',
    properties: { className: ['figura'] },
    children: hijos,
  };
}

const RE_PDF_LOCAL = /^\/media\/.*\.pdf(?:[?#].*)?$/i;

/** Un enlace a un PDF propio, marcado para que scripts/visor.ts lo abra en el
 * panel flotante en vez de dejar que el navegador navegue a él. Cualquier
 * otro enlace —externo, o a otra cosa que no sea un PDF bajo /media/— sigue
 * siendo un enlace normal: la decisión es de la ruta exacta, no de que
 * termine en «.pdf» en cualquier sitio. */
function marcarSiEsPdfLocal(a) {
  const href = String(a.properties?.href ?? '');
  if (!RE_PDF_LOCAL.test(href)) return;
  const nombre = textoDe(a).trim() || href;
  a.properties.href = rutaMedia(href);
  a.properties.className = [...(a.properties.className ?? []), 'visor-abrir'];
  a.properties['data-nombre'] = nombre;
  a.properties.target = '_blank';
  a.properties.rel = ['noopener'];
}

/** Un enlace del cuerpo a un sitio ajeno se abre en pestaña nueva, para no
 * perder a quien lee un proyecto o una publicación a mitad de un artículo
 * externo. Nunca compite con marcarSiEsPdfLocal(), arriba: esExterno()
 * siempre da falso para una ruta /media/ (no empieza con http(s)), así que
 * un mismo enlace nunca entra a las dos funciones. */
function marcarSiEsExterno(a) {
  const href = String(a.properties?.href ?? '');
  if (!esExterno(href)) return;
  a.properties.target = '_blank';
  a.properties.rel = [...(a.properties.rel ?? []), 'noopener'];
  a.children.push(...nodosMarcaExterna());
}

/**
 * Recorrido en post-orden (primero los hijos, después el propio nodo): así,
 * cuando se decide si un `<p>` se desenvuelve, su imagen ya se convirtió en
 * `<figure>` y la comprobación es sobre lo que va a quedar, no sobre lo que
 * había antes. Una sustitución reemplaza el nodo en el mismo índice del
 * arreglo de hijos de su padre, así que no hace falta reajustar ningún otro
 * índice.
 *
 * El patrón que escribe el dueño desde /admin es una imagen sola en su
 * propia línea de Markdown, que remark-rehype ya entrega como `<p><img></p>`:
 * ese `<p>` se desenvuelve para dejar el `<figure>` como hijo directo de
 * quien lo contenía —un `<figure>` (contenido de flujo) no puede vivir dentro
 * de un `<p>` (solo admite contenido de frase) sin que el navegador reordene
 * el árbol por su cuenta—. Una imagen mezclada con texto en el mismo párrafo
 * queda fuera de ese caso feliz y conserva su `<p>`, con el `<figure>`
 * anidado dentro tal cual: no es el patrón que se pidió cubrir, y forzarlo a
 * desenvolverse ahí partiría el párrafo en dos sin que nadie lo haya escrito
 * así.
 */
function transformar(nodo) {
  if (!nodo || !Array.isArray(nodo.children)) return nodo;
  nodo.children = nodo.children.map((hijo) => transformar(hijo));

  if (nodo.type === 'element' && nodo.tagName === 'p') {
    const sustanciales = nodo.children.filter((n) => !esBlancoOVacio(n));
    if (sustanciales.length === 1 && sustanciales[0].type === 'element' && sustanciales[0].tagName === 'figure') {
      return sustanciales[0];
    }
    return nodo;
  }

  if (nodo.type === 'element' && nodo.tagName === 'img') {
    return crearFigura(nodo);
  }

  if (nodo.type === 'element' && nodo.tagName === 'a') {
    marcarSiEsPdfLocal(nodo);
    marcarSiEsExterno(nodo);
    return nodo;
  }

  return nodo;
}

/** El plugin de rehype: `markdown.rehypePlugins` en astro.config.mjs lo llama
 * una vez por página y espera de vuelta la función que transforma el árbol.
 */
export default function rehypeFiguras() {
  return (tree) => {
    transformar(tree);
  };
}
