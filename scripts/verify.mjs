/* Verifica el sitio compilado. Cada comprobación existe por un fallo real, y
 * todos fallaban en silencio. El detalle, en el README.
 *
 * Regla: ninguna comprobación nombra contenido concreto — un título, un
 * nombre de proyecto, un usuario, una tecnología, un slug de entrada, una
 * fecha, un conteo de entradas. El contenido lo edita un CMS (Sveltia, en
 * /admin) que commitea directo a `main`, y Cloudflare construye esa misma
 * rama: un cambio legítimo de contenido (renombrar un proyecto, agregar el
 * cuerpo de una publicación, quitar una tecnología, cambiar el nombre del
 * dueño del sitio) no puede romper el build. Todo se deriva en su lugar de
 * `src/content/*.md`, de `src/content/perfil.yaml` o de lo que el propio
 * build ya generó en `dist/` — nunca de un literal escrito a mano. Las
 * excepciones son explícitas y llevan su propio comentario: los slugs de
 * sección (vienen de `SECCIONES` en `src/lib/content.ts`, que es código, no
 * contenido del CMS) y algún dato de infraestructura fija (el repositorio
 * que declara `config.yml`, que tampoco lo edita el CMS). */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { parse as parseYaml } from 'yaml';

const DIST = 'dist';
let fails = 0;

const check = (name, cond, detail = '') => {
  if (cond) {
    console.log('  ok    ' + name);
  } else {
    fails++;
    console.log('  FALLA ' + name + (detail ? ' — ' + detail : ''));
  }
};

// Una comprobación que necesita dos entradas hermanas (anterior/siguiente) no
// tiene nada que probar con menos de dos: en vez de fallar por falta de
// contenido o pasar en silencio, queda explícita en la salida como omitida.
const skip = (name, motivo) => console.log('  ok    ' + name + ' — omitida: ' + motivo);

if (!existsSync(DIST)) {
  console.error('No hay dist/. Ejecute `npm run build` primero.');
  process.exit(1);
}

// El sitio tiene páginas de artículo y de tecnología que ninguna comprobación
// anterior recorría: pasaban por no estar en la lista, no por estar bien.
function listarHtml(dir) {
  let out = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) out = out.concat(listarHtml(ruta));
    else if (nombre.endsWith('.html')) out.push(ruta);
  }
  return out;
}
// El panel de administración (Sveltia CMS) no es una página del sitio: no
// lleva sidebar, ni h1 de artículo, ni skip link, no entra al sitemap y su
// propio noindex es intencional en vez de una regresión. Se excluye aquí, una
// sola vez, de las comprobaciones pensadas para las páginas del sitio; sus
// propias comprobaciones viven en la sección «Panel de administración (CMS)»
// más abajo.
const ADMIN_HTML = join(DIST, 'admin', 'index.html');
const paginasHtml = listarHtml(DIST).filter((r) => r !== ADMIN_HTML);

const html = readFileSync(join(DIST, 'index.html'), 'utf8');

// ── Contenido fuente, leído una sola vez ────────────────────────────────────
// Lo que sigue relee las mismas fuentes que el sitio (src/content/*.md y
// perfil.yaml) para derivar lo que antes estaba escrito a mano. No es un
// duplicado de src/lib/content.ts: ese módulo importa `astro:content`, que
// solo existe dentro de Astro, así que aquí se reproduce la misma lectura con
// `fs` — igual que ya hacía el resto del archivo con content.config.ts y con
// el propio perfil.yaml.
function leerFrontmatter(ruta) {
  const texto = readFileSync(ruta, 'utf8');
  const m = texto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: '' };
  return { data: parseYaml(m[1]) ?? {}, body: (m[2] ?? '').trim() };
}
function listarColeccionMd(dir) {
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.md'))
        .map((f) => {
          const { data, body } = leerFrontmatter(join(dir, f));
          return { id: f.replace(/\.md$/, ''), data, body };
        })
    : [];
}
const tieneCuerpoFuente = (entrada) => entrada.body.length > 0;

// Mismo orden que getProyectos()/getPublicaciones() en src/lib/content.ts:
// más reciente primero, sin contar los borradores.
const proyectosSrc = listarColeccionMd('src/content/proyectos')
  .filter((p) => !p.data.borrador)
  .sort((a, b) => String(b.data.fecha ?? '').localeCompare(String(a.data.fecha ?? '')));
const publicacionesSrc = listarColeccionMd('src/content/publicaciones')
  .filter((p) => !p.data.borrador)
  .sort((a, b) => Number(b.data.anio ?? 0) - Number(a.data.anio ?? 0));

// Mismo orden que getExperiencia(): sin fecha de fin primero (sigue vigente),
// luego por fecha de inicio descendente. Una entrada que solo enlaza a un
// proyecto (`proyecto:`) no declara su propio stack — igual que en getStack().
const experienciaSrc = listarColeccionMd('src/content/experiencia').sort((a, b) => {
  if (!a.data.fin && b.data.fin) return -1;
  if (a.data.fin && !b.data.fin) return 1;
  return String(b.data.inicio ?? '').localeCompare(String(a.data.inicio ?? ''));
});
const experienciaConStack = experienciaSrc.find(
  (e) => !e.data.proyecto && Array.isArray(e.data.st) && e.data.st.length > 0,
);

const perfilYamlData = parseYaml(readFileSync('src/content/perfil.yaml', 'utf8'))?.perfil ?? {};
const nombreEsperado = perfilYamlData.nombre ?? '';
const githubEsperado = perfilYamlData.github ?? '';

// El slug de sección es código (SECCIONES en src/lib/content.ts), no algo que
// edite el CMS: se relee del fuente en vez de retipearlo, para que agregar o
// quitar una sección no desalinee estas comprobaciones en silencio.
function leerSlugsDeSecciones() {
  const src = readFileSync('src/lib/content.ts', 'utf8');
  const inicio = src.indexOf('export const SECCIONES');
  const fin = src.indexOf('\n];', inicio);
  if (inicio === -1 || fin === -1) return [];
  return [...src.slice(inicio, fin).matchAll(/slug:\s*'([^']+)'/g)].map((m) => m[1]);
}
const SECCIONES_SLUGS = leerSlugsDeSecciones();

console.log('\nDocumento');
check('doctype', html.trimStart().toLowerCase().startsWith('<!doctype html>'));
check('lang declarado', /<html[^>]+lang="es"/.test(html));
check('charset utf-8', /<meta\s+charset="utf-8"/i.test(html));
check('viewport', /name="viewport"[^>]*width=device-width/.test(html));
check('title no vacío', /<title>[^<]{10,}<\/title>/.test(html));
check('description', /name="description"[^>]*content="[^"]{40,}"/.test(html));
check('canonical absoluta', /rel="canonical"[^>]*href="https:\/\//.test(html));
check('open graph', /property="og:title"/.test(html));
check('autor', /name="author"/.test(html));

const h1s = html.match(/<h1[\s\S]*?<\/h1>/g) || [];
check('exactamente un h1', h1s.length === 1, h1s.length + ' encontrados');
const h1txt = (h1s[0] || '').replace(/<[^>]+>/g, '');
// Astro recorta el espacio al final de línea: un salto junto a una etiqueta
// pega las palabras. Se lee bien en el código y se ve mal en pantalla.
const h1limpio = h1txt.replace(/\s+/g, ' ').trim();
check(
  'h1 con el nombre completo',
  nombreEsperado.length > 0 && h1limpio.includes(nombreEsperado),
  `"${h1limpio}" ≠ contiene "${nombreEsperado || '(perfil.yaml sin nombre)'}"`,
);
// Se ata a la forma del fallo y no al texto: una minúscula seguida de mayúscula
// o de un paréntesis es una palabra pegada. Atarlo a una frase concreta lo
// convierte en una prueba que hay que reescribir cada vez que cambia la copia.
const pegadas = h1limpio.match(/[a-záéíóúñ][A-ZÁÉÍÓÚÑ(]/g) || [];
check('h1 sin palabras pegadas', pegadas.length === 0, pegadas.join(', '));
check('theme-color', /name="theme-color"/.test(html));

// El favicon y el logo son dibujos de píxeles: se sostienen en que cada bloque
// caiga en un píxel entero y en no usar más color que los tres de la paleta. Un
// degradado o media unidad fuera de la rejilla se ve como un borde sucio justo
// al tamaño en que el favicon se mira, 16 px. Probado en el navegador el
// 2026-09-17: el logo completo NO sobrevive a 16 px —el marco se corta y «JB»
// se empasta—, así que el favicon lleva solo el prompt.
const COLORES_MARCA = ['#06080F', '#B7CC85', '#E0C15A'];
for (const [archivo, lado] of [
  ['favicon.svg', 16],
  ['logo.svg', 64],
]) {
  const svg = existsSync(join(DIST, archivo)) ? readFileSync(join(DIST, archivo), 'utf8') : '';
  check(`${archivo} servido`, svg !== '');
  if (svg === '') continue;
  check(
    `${archivo} dibuja sobre una rejilla de ${lado} unidades`,
    new RegExp(`viewBox="0 0 ${lado} ${lado}"`).test(svg),
    (svg.match(/viewBox="[^"]*"/) || ['sin viewBox'])[0],
  );
  const colores = [...new Set([...svg.matchAll(/#[0-9a-fA-F]{3,6}/g)].map((m) => m[0].toUpperCase()))];
  check(
    `${archivo} usa solo los tres colores de la marca`,
    colores.every((c) => COLORES_MARCA.includes(c)),
    colores.join(', '),
  );
  // Un favicon que pide otro archivo no se pinta en una pestaña: el navegador
  // no resuelve referencias externas ahí. Tampoco hay degradados, que a 16 px
  // se convierten en barro.
  check(
    `${archivo} no depende de nada externo ni usa degradados`,
    !/<image|xlink:href|url\(|Gradient/i.test(svg),
  );
  check(
    `${archivo} pinta con bordes duros, sin suavizado`,
    /shape-rendering="crispEdges"/.test(svg),
    'sin crispEdges el navegador interpola los bloques y los bordes salen sucios',
  );
}

// iOS ignora el favicon SVG y usa este PNG para el icono de la pantalla de
// inicio. Sin declararlo, recorta una captura de la página.
check('apple-touch-icon servido', existsSync(join(DIST, 'apple-touch-icon.png')));
check(
  'todas las páginas declaran el apple-touch-icon',
  paginasHtml.every((r) => /rel="apple-touch-icon"/.test(readFileSync(r, 'utf8'))),
);

console.log('\nDominio');
// Un solo dominio en canónica, robots y sitemap. Si no coinciden, el buscador
// le acredita el contenido a otro sitio y la vista previa al compartir apunta
// donde no debe. Falla en silencio: la página se ve perfecta.
const dominio = (t) => (t.match(/https:\/\/[a-z0-9.-]+/i) || [''])[0];
const canon = dominio(html.match(/rel="canonical"[^>]*href="([^"]+)"/)?.[1] || '');
const robots = existsSync(join(DIST, 'robots.txt'))
  ? dominio(readFileSync(join(DIST, 'robots.txt'), 'utf8').match(/Sitemap:\s*(\S+)/)?.[1] || '')
  : '';
const sitemapPath = join(DIST, 'sitemap-index.xml');
check('sitemap generado', existsSync(sitemapPath), 'robots.txt lo anuncia; tiene que existir');
const mapa = existsSync(sitemapPath) ? dominio(readFileSync(sitemapPath, 'utf8')) : '';
check('canónica, robots y sitemap en el mismo dominio', canon && canon === robots && canon === mapa, [
  'canónica ' + (canon || '—'),
  'robots ' + (robots || '—'),
  'sitemap ' + (mapa || '—'),
].join(' · '));

// Con build.format 'file' la URL de cada página termina en .html, pero
// Cloudflare Pages responde a esa ruta con un 308 hacia la versión sin
// extensión, que es la que lista el sitemap. Una canónica con .html le da al
// buscador tres URL para el mismo documento: la declarada, la redirigida y la
// del mapa. Cada página indexable debe declarar exactamente la URL del sitemap.
const sinBarraFinal = (u) => u.replace(/\/$/, '');
const urlsMapa = new Set(
  readdirSync(DIST)
    .filter((n) => /^sitemap-\d+\.xml$/.test(n))
    .flatMap((n) => [...readFileSync(join(DIST, n), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => sinBarraFinal(m[1]))),
);
const canonicasMal = [];
let canonicasRevisadas = 0;
for (const ruta of paginasHtml) {
  const nombre = relative(DIST, ruta).replace(/\\/g, '/');
  if (nombre === '404.html') continue;
  const contenido = readFileSync(ruta, 'utf8');
  const canonica = contenido.match(/rel="canonical"[^>]*href="([^"]+)"/)?.[1] || '';
  const ogUrl = contenido.match(/property="og:url"[^>]*content="([^"]+)"/)?.[1] || '';
  canonicasRevisadas++;
  if (!urlsMapa.has(sinBarraFinal(canonica)) || ogUrl !== canonica) {
    canonicasMal.push(`${nombre} → ${canonica || '—'}${ogUrl !== canonica ? ` (og:url ${ogUrl || '—'})` : ''}`);
  }
}
// La página 404 se sirve en cualquier ruta inexistente: una canónica ahí le
// propone al buscador una URL (/404) que no existe como documento. No declara
// canónica ni og:url y pide no indexarse.
const html404 = existsSync(join(DIST, '404.html')) ? readFileSync(join(DIST, '404.html'), 'utf8') : '';
check(
  '404 sin canónica y con noindex',
  html404 !== '' &&
    !/rel="canonical"/.test(html404) &&
    !/property="og:url"/.test(html404) &&
    /<meta\s+name="robots"\s+content="noindex"/.test(html404),
);
check(
  'solo la 404 pide noindex',
  paginasHtml.every((r) => relative(DIST, r).replace(/\\/g, '/') === '404.html' || !/name="robots"[^>]*noindex/.test(readFileSync(r, 'utf8'))),
);

check(
  'canónica y og:url de cada página coinciden con el sitemap',
  urlsMapa.size > 0 && canonicasRevisadas === urlsMapa.size && canonicasMal.length === 0,
  canonicasMal.length ? canonicasMal.join(' · ') : `${canonicasRevisadas} páginas, ${urlsMapa.size} en el sitemap`,
);

console.log('\nTipografía');
// Área de Uso Privado: sin la fuente empaquetada es un cuadrado vacío.
check('cerebro U+EE9C presente', html.includes(''));
check('fuente Regular servida', existsSync(join(DIST, 'fonts/jb-Regular.woff2')));
check('fuente Bold servida', existsSync(join(DIST, 'fonts/jb-Bold.woff2')));
check('preload de la fuente', /rel="preload"[^>]*jb-Regular\.woff2/.test(html));
check(
  'preload con crossorigin',
  /rel="preload"[^>]*jb-Regular\.woff2[^>]*crossorigin/.test(html),
  'sin crossorigin el navegador descarta la precarga y descarga dos veces',
);

console.log('\nBanner');
// Los espacios finales son parte del dibujo y los editores los borran.
const banner = readFileSync('src/data/banner.txt', 'utf8').replace(/\n+$/, '').split('\n');
const anchos = new Set(banner.map((r) => r.length));
check('banner alineado', anchos.size === 1, 'anchos distintos: ' + [...anchos].join(', '));
// La foto reemplaza al banner en el bloque de arranque cuando perfil.yaml
// trae `foto` (ver Terminal.astro); sin ella, el propio componente cae al
// banner y esta comprobación sigue teniendo sentido tal como estaba.
const fotoYaml = perfilYamlData.foto;
if (fotoYaml && fotoYaml.src) {
  skip('banner en el HTML', 'perfil.yaml trae foto: el arranque muestra la foto en vez del banner ASCII');
} else {
  check('banner en el HTML', html.includes('█'));
}

// La marca de la barra lateral, desde que la foto ocupa el bloque de arranque:
// es el único lugar donde queda el nombre dibujado, así que se comprueba que
// esté, que quepa y que no se lea dos veces. El ancho de la barra son 24ch
// (src/styles/sidebar.css) menos su relleno a los lados, y el dibujo se pinta
// a --text-xs (0.8em): el presupuesto es (24 - 2) / 0.8 ≈ 27 columnas. Por
// encima, el dibujo se corta o fuerza una barra de desplazamiento. La medida
// de verdad la da el navegador; esto solo ataja el desborde evidente.
const hayMarca = existsSync('src/data/marca.txt');
check('existe el dibujo de la marca', hayMarca, 'falta src/data/marca.txt');
const marca = hayMarca ? readFileSync('src/data/marca.txt', 'utf8').replace(/\n+$/, '').split('\n') : [''];
const anchosMarca = new Set(marca.map((r) => r.length));
const marcaHtml = (html.match(/<a[^>]*class="sidebar-marca"[\s\S]*?<\/a>/) || [])[0] || '';
// Sin el archivo estas tres no pueden afirmar nada: un dibujo vacío tiene
// todas sus filas del mismo ancho, cabe en cualquier barra y está contenido
// en cualquier HTML. Sin esta guarda daban verde justo cuando falta.
if (!hayMarca) {
  skip('marca alineada', 'no hay src/data/marca.txt que medir');
  skip('la marca cabe en la barra lateral', 'no hay src/data/marca.txt que medir');
  skip('la barra lateral dibuja la marca', 'no hay src/data/marca.txt que buscar en el HTML');
} else {
  check('marca alineada', anchosMarca.size === 1, 'anchos distintos: ' + [...anchosMarca].join(', '));
  check(
    'la marca cabe en la barra lateral',
    [...anchosMarca][0] <= 27,
    `${[...anchosMarca][0]} columnas; el presupuesto es 27`,
  );
  check('la barra lateral dibuja la marca', marcaHtml.includes(marca[marca.length - 1]), marcaHtml.slice(0, 80));
}
// El dibujo no es texto: sin aria-hidden un lector de pantalla leería las
// filas de bloques carácter por carácter, y sin nombre accesible el enlace
// quedaría anunciado como «enlace» y nada más.
check('el dibujo de la marca queda oculto al lector de pantalla', /<pre[^>]*aria-hidden="true"/.test(marcaHtml));
check('el enlace de la marca conserva su nombre accesible', /aria-label="[^"]+"/.test(marcaHtml));
// letter-spacing hereda de .sidebar-marca (--tracking-wide) y separaría las
// columnas del dibujo, que dejarían de formar las letras.
check(
  'el dibujo de la marca no arrastra letter-spacing',
  /\.sidebar-marca-dibujo[^{]*\{[^}]*letter-spacing:\s*normal/.test(readFileSync('src/styles/sidebar.css', 'utf8')),
);

console.log('\nCSS');
const cssFiles = existsSync(join(DIST, '_astro'))
  ? readdirSync(join(DIST, '_astro')).filter((f) => f.endsWith('.css'))
  : [];
const css =
  cssFiles.map((f) => readFileSync(join(DIST, '_astro', f), 'utf8')).join('\n') +
  (html.match(/<style>[\s\S]*?<\/style>/g) || []).join('\n');
// CSS no avisa de una variable inexistente: hereda en silencio.
const usadas = new Set([...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
const definidas = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
const fantasma = [...usadas].filter((v) => !definidas.has(v));
check('sin variables fantasma', fantasma.length === 0, fantasma.join(', '));

console.log('\nFoto de perfil (bloque de arranque)');
// Mismo criterio que arriba: sin `foto` en perfil.yaml, el arranque cae al
// banner y estas comprobaciones no tienen nada que probar — quedan omitidas,
// no en rojo ni en verde por accidente.
//
// El tamaño real se lee del propio JPEG (marcador SOF) en vez de confiar en
// el width/height que puso el HTML: comparar el HTML contra sí mismo no
// probaría nada.
function tamanoJpeg(ruta) {
  const buf = readFileSync(ruta);
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

const NOMBRES_CHECK_FOTO = [
  'la home trae exactamente una <img>',
  'el alt de la foto no está vacío',
  'width y height están presentes, son numéricos y coinciden (foto cuadrada)',
  'el archivo de la foto existe en dist/',
  'la foto pesa menos de 200 KB',
  'la ruta de la foto en el HTML coincide con perfil.yaml',
  'width/height del HTML coinciden con el tamaño real del archivo',
  'el CSS de .foto no fija width (solo max-width): nunca se agranda más allá de su tamaño real',
];
if (!fotoYaml || !fotoYaml.src) {
  for (const nombre of NOMBRES_CHECK_FOTO) skip(nombre, 'perfil.yaml no trae foto: el arranque usa el banner ASCII');
} else {
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  check('la home trae exactamente una <img>', imgs.length === 1, `${imgs.length} encontradas`);
  const imgTag = imgs[0] || '';
  const altHome = (imgTag.match(/\salt="([^"]*)"/) || [])[1] ?? '';
  const widthHome = Number((imgTag.match(/\swidth="(\d+)"/) || [])[1] ?? NaN);
  const heightHome = Number((imgTag.match(/\sheight="(\d+)"/) || [])[1] ?? NaN);
  check('el alt de la foto no está vacío', altHome.trim().length > 0);
  check(
    'width y height están presentes, son numéricos y coinciden (foto cuadrada)',
    Number.isFinite(widthHome) && Number.isFinite(heightHome) && widthHome === heightHome,
    `width="${widthHome}" height="${heightHome}"`,
  );

  const fotoDistPath = join(DIST, fotoYaml.src.replace(/^\//, ''));
  const fotoExiste = existsSync(fotoDistPath);
  check('el archivo de la foto existe en dist/', fotoExiste, fotoDistPath);
  const pesoFoto = fotoExiste ? statSync(fotoDistPath).size : Infinity;
  check(
    'la foto pesa menos de 200 KB',
    pesoFoto < 200 * 1024,
    Number.isFinite(pesoFoto) ? (pesoFoto / 1024).toFixed(1) + ' KB' : 'no existe',
  );

  const srcHome = (imgTag.match(/\ssrc="([^"]*)"/) || [])[1] ?? '';
  check(
    'la ruta de la foto en el HTML coincide con perfil.yaml',
    srcHome === fotoYaml.src,
    `html "${srcHome}" ≠ yaml "${fotoYaml.src}"`,
  );

  const tamReal = fotoExiste ? tamanoJpeg(fotoDistPath) : null;
  check(
    'width/height del HTML coinciden con el tamaño real del archivo',
    !!tamReal && widthHome === tamReal.width && heightHome === tamReal.height,
    tamReal
      ? `html ${widthHome}x${heightHome} ≠ archivo ${tamReal.width}x${tamReal.height}`
      : 'no se pudo leer el marcador SOF del JPEG',
  );

  // La CSP del sitio no admite atributos style= ni <style> en línea (ver
  // Terminal.astro), así que el tope no puede llevar el ancho real inyectado:
  // en vez de eso, la regla evita `width` y solo declara `max-width` en ch —
  // sin `width` propio, el navegador usa el tamaño intrínseco (los atributos
  // width/height ya comprobados arriba) como ancho por defecto, y max-width
  // únicamente puede achicarlo, nunca agrandarlo.
  // Astro añade [data-astro-cid-...] al selector con alcance de componente, y
  // el CSS de producción sale minificado: la búsqueda tolera ambas cosas.
  const reglaFoto = (css.match(/\.foto(?:\[[^\]]*\])?\s*\{[^}]*\}/) || [''])[0];
  const maxWidthCh = /max-width\s*:\s*[\d.]+ch/.test(reglaFoto);
  // Lookbehind negativo: excluye el "width:" que ya trae "max-width:" o
  // "min-width:", sin tocar un "width:" propio si alguna vez se cuela uno.
  const sinWidthPropio = !/(?<!-)\bwidth\s*:/.test(reglaFoto);
  check(
    'el CSS de .foto no fija width (solo max-width): nunca se agranda más allá de su tamaño real',
    reglaFoto !== '' && maxWidthCh && sinWidthPropio,
    reglaFoto || '(sin regla .foto en el CSS)',
  );
}

console.log('\nEscala de espaciado');
// Un rem o px suelto en margin/padding/gap/inset es la escala arbitraria que
// --space-* vino a reemplazar: si se cuela uno nuevo, esta comprobación lo
// atrapa antes de que se sume a la mezcla.
function archivosConExtension(dir, ext) {
  let out = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) out = out.concat(archivosConExtension(ruta, ext));
    else if (nombre.endsWith(ext)) out.push(ruta);
  }
  return out;
}
const fuentesCss = archivosConExtension('src', '.css');
const fuentesAstro = archivosConExtension('src', '.astro');

const PROP_ESPACIADO =
  /\b(margin(?:-top|-right|-bottom|-left)?|padding(?:-top|-right|-bottom|-left)?|row-gap|column-gap|gap|inset)\s*:\s*([^;]+);/;
const VALOR_CRUDO = /(-?\d*\.?\d+)(rem|px)/g;

// 0 no necesita token, auto no es una medida y -9999px es el truco conocido
// para sacar un elemento de pantalla sin tocar el layout: los tres quedan
// fuera del barrido a propósito.
function valoresCrudos(valor) {
  return [...valor.matchAll(VALOR_CRUDO)].filter(([literal, num]) => {
    if (literal === '-9999px') return false;
    return Number(num) !== 0;
  });
}

function crudosEnTexto(rutaMostrada, texto, offsetLinea) {
  const encontrados = [];
  texto.split('\n').forEach((linea, i) => {
    const decl = PROP_ESPACIADO.exec(linea);
    if (!decl) return;
    if (valoresCrudos(decl[2]).length > 0) {
      encontrados.push(`${rutaMostrada}:${offsetLinea + i + 1}`);
    }
  });
  return encontrados;
}

let crudos = [];
for (const ruta of fuentesCss) {
  const mostrada = ruta.replace(/\\/g, '/');
  crudos = crudos.concat(crudosEnTexto(mostrada, readFileSync(ruta, 'utf8'), 0));
}
for (const ruta of fuentesAstro) {
  const mostrada = ruta.replace(/\\/g, '/');
  const contenido = readFileSync(ruta, 'utf8');
  const bloque = contenido.match(/<style>[\s\S]*?<\/style>/);
  if (!bloque) continue;
  const offsetLinea = contenido.slice(0, bloque.index).split('\n').length - 1;
  crudos = crudos.concat(crudosEnTexto(mostrada, bloque[0], offsetLinea));
}
check(
  'sin rem/px sueltos en margin/padding/gap/inset',
  crudos.length === 0,
  crudos.join(' · '),
);

const tokensSrc = readFileSync('src/styles/tokens.css', 'utf8');
const espaciosFaltantes = [];
for (let n = 1; n <= 10; n++) {
  if (!new RegExp(`--space-${n}:\\s*[\\d.]+rem`).test(tokensSrc)) espaciosFaltantes.push(`--space-${n}`);
}
check('las diez variables --space-* existen en tokens.css', espaciosFaltantes.length === 0, espaciosFaltantes.join(', '));

console.log('\nPunto de quiebre');
// Dos anchos de quiebre son dos sitios donde el diseño puede desalinearse
// entre sí sin que ninguna comprobación anterior lo note.
const anchosDistintos = [];
for (const ruta of [...fuentesCss, ...fuentesAstro]) {
  const contenido = readFileSync(ruta, 'utf8');
  for (const m of contenido.matchAll(/@media[^{]*\((?:max|min)-width:\s*([^)]+)\)/g)) {
    const valor = m[1].trim();
    if (valor !== '660px') anchosDistintos.push(`${ruta.replace(/\\/g, '/')}: ${valor}`);
  }
}
check('un solo punto de quiebre, 660px', anchosDistintos.length === 0, anchosDistintos.join(' · '));

console.log('\nEscala tipográfica');
// Un em, un número o una unidad sueltos en font-size/line-height/letter-spacing
// son la escala arbitraria que --text-*/--lh-*/--tracking-* vino a reemplazar:
// si se cuela uno nuevo, esta comprobación lo atrapa antes de que se sume a la
// mezcla.

// Las excepciones se atan al selector de la regla y no al número de línea: una
// línea agregada más arriba no rompe la comprobación, y un valor crudo nuevo no
// se cuela por caer en una línea exceptuada.

// El banner ASCII vive fuera de la escala: su clamp en px mantiene el dibujo
// dentro del ancho, no es texto que deba medirse en em.
const BANNER_EXCEPCIONES = [/^\.logo$/];

// Ninguna regla de este sitio necesita hoy una excepción de letter-spacing:
// se deja el mecanismo listo (así lo usaba la barra del stack, con glifos █
// pegados) para el día que alguna vuelva a necesitarlo.
const GLIFO_EXCEPCIONES = [];

const RAW_FONT_SIZE = /\bfont-size\s*:\s*([^;]+);/;
const RAW_LINE_HEIGHT = /\bline-height\s*:\s*([^;]+);/;
const RAW_LETTER_SPACING = /\bletter-spacing\s*:\s*([^;]+);/;
const esCrudo = (valor) => /\d/.test(valor) && !/^var\(/.test(valor.trim());

function crudosDeclaracion(regexProp, excepciones) {
  const encontrados = [];
  const revisarTexto = (mostrada, texto, offsetLinea) => {
    let selector = '';
    texto.split('\n').forEach((linea, i) => {
      const apertura = linea.match(/^\s*([^{}]+?)\s*\{\s*$/);
      if (apertura) selector = apertura[1];
      const m = regexProp.exec(linea);
      if (m && esCrudo(m[1]) && !excepciones.some((re) => re.test(selector))) {
        encontrados.push(`${mostrada}:${offsetLinea + i + 1}`);
      }
    });
  };
  for (const ruta of fuentesCss) {
    revisarTexto(ruta.replace(/\\/g, '/'), readFileSync(ruta, 'utf8'), 0);
  }
  for (const ruta of fuentesAstro) {
    const contenido = readFileSync(ruta, 'utf8');
    const bloque = contenido.match(/<style>[\s\S]*?<\/style>/);
    if (!bloque) continue;
    const offsetLinea = contenido.slice(0, bloque.index).split('\n').length - 1;
    revisarTexto(ruta.replace(/\\/g, '/'), bloque[0], offsetLinea);
  }
  return encontrados;
}

const crudosFontSize = crudosDeclaracion(RAW_FONT_SIZE, BANNER_EXCEPCIONES);
check('sin font-size crudo fuera de --text-*', crudosFontSize.length === 0, crudosFontSize.join(' · '));

const crudosLineHeight = crudosDeclaracion(RAW_LINE_HEIGHT, BANNER_EXCEPCIONES);
check('sin line-height crudo fuera de --lh-*', crudosLineHeight.length === 0, crudosLineHeight.join(' · '));

const crudosLetterSpacing = crudosDeclaracion(RAW_LETTER_SPACING, GLIFO_EXCEPCIONES);
check(
  'sin letter-spacing crudo fuera de --tracking-*',
  crudosLetterSpacing.length === 0,
  crudosLetterSpacing.join(' · '),
);

const TOKENS_TIPOGRAFIA = [
  '--text-xs',
  '--text-sm',
  '--text-base',
  '--text-md',
  '--text-lg',
  '--text-xl',
  '--text-2xl',
  '--lh-tight',
  '--lh-snug',
  '--lh-loose',
  '--tracking-tight',
  '--tracking-wide',
  '--tracking-wider',
];
const tokensTipografiaFaltantes = TOKENS_TIPOGRAFIA.filter(
  (t) => !new RegExp(`${t}:\\s*\\S`).test(tokensSrc),
);
check(
  'las variables de escala tipográfica existen en tokens.css',
  tokensTipografiaFaltantes.length === 0,
  tokensTipografiaFaltantes.join(', '),
);

function valoresDeclaracion(regexProp) {
  const valores = [];
  const revisarTexto = (mostrada, texto) => {
    for (const m of texto.matchAll(new RegExp(regexProp.source, 'g'))) {
      valores.push({ ruta: mostrada, valor: m[1].trim() });
    }
  };
  for (const ruta of fuentesCss) {
    revisarTexto(ruta.replace(/\\/g, '/'), readFileSync(ruta, 'utf8'));
  }
  for (const ruta of fuentesAstro) {
    const contenido = readFileSync(ruta, 'utf8');
    const bloque = contenido.match(/<style>[\s\S]*?<\/style>/);
    if (!bloque) continue;
    revisarTexto(ruta.replace(/\\/g, '/'), bloque[0]);
  }
  return valores;
}

// Solo dos archivos de fuente se sirven, Regular y Bold: cualquier otro peso
// lo sintetiza el navegador, y una negrita sintética no es la misma letra.
const pesos = valoresDeclaracion(/\bfont-weight\s*:\s*([^;]+);/);
const pesosInvalidos = pesos.filter((p) => p.valor !== '400' && p.valor !== '700');
check(
  'todo font-weight es 400 o 700 (únicas fuentes servidas)',
  pesosInvalidos.length === 0,
  pesosInvalidos.map((p) => `${p.ruta}: ${p.valor}`).join(' · '),
);

console.log('\nAlcance del CSS');
// Los estilos de un .astro llevan alcance y no alcanzan a los elementos que
// crea el script. La página se ve casi bien y nada avisa.
const RUNTIME = ['tap-hint', 'caret', 'brain', 'inputline', 'typed', 'entry', 'out'];
for (const cls of RUNTIME) {
  const suelta = new RegExp('\\.' + cls + '(?![\\w-])(?!\\[data-astro-cid)');
  check(
    'sin alcance: .' + cls,
    suelta.test(css),
    'solo existe con alcance de componente; el script crea ese elemento y no lo recibe',
  );
}

// El enlace vive en el HTML y el comando `contacto` lo repite dentro del script.
// Estuvieron apuntando a un usuario que no existe y la página no se rompe: un
// enlace muerto se ve igual que uno bueno hasta que alguien lo pulsa.
const jsFiles = existsSync(join(DIST, '_astro'))
  ? readdirSync(join(DIST, '_astro')).filter((f) => f.endsWith('.js'))
  : [];
const js = jsFiles.map((f) => readFileSync(join(DIST, '_astro', f), 'utf8')).join('\n');
const handles = new Set(
  [...(html + '\n' + js).matchAll(/github\.com\/([\w-]+)/g)].map((m) => m[1]),
);
check('un solo usuario de GitHub', handles.size === 1, [...handles].join(', '));
check(
  'usuario de GitHub correcto',
  githubEsperado.length > 0 && handles.has(githubEsperado),
  `${[...handles].join(', ')} ≠ "${githubEsperado || '(perfil.yaml sin github)'}"`,
);

console.log('\nDatos');
// El stack es la promesa del sitio: cada tecnología enlaza a la evidencia de
// haberla usado. Si el número y las fuentes se separan, el sitio miente sin que
// nadie lo haya escrito.
const stackPath = join(DIST, 'stack.json');
check('stack.json generado', existsSync(stackPath));
const stack = existsSync(stackPath) ? JSON.parse(readFileSync(stackPath, 'utf8')) : [];
check('stack no vacío', stack.length > 0);

const sinFuente = stack.filter((s) => s.usos !== s.fuentes.length);
check(
  'cada uso del stack tiene su fuente',
  sinFuente.length === 0,
  sinFuente.map((s) => `${s.tech}: ${s.usos} usos, ${s.fuentes.length} fuentes`).join('; '),
);

// La misma entrada contada dos veces infla el número sin que se note.
const repetidas = stack.filter((s) => new Set(s.fuentes.map((f) => f.id)).size !== s.fuentes.length);
check('sin fuentes repetidas', repetidas.length === 0, repetidas.map((s) => s.tech).join(', '));

// «PostgreSQL» y «postgresql» son la misma tecnología escrita de dos formas, y
// el conteo se parte en dos sin avisar. Es el fallo más fácil de cometer al
// agregar una entrada nueva.
const porNombre = new Map();
for (const s of stack) {
  const clave = s.tech.toLowerCase().replace(/[\s.-]/g, '');
  porNombre.set(clave, [...(porNombre.get(clave) || []), s.tech]);
}
const variantes = [...porNombre.values()].filter((v) => v.length > 1);
check(
  'sin tecnologías escritas de dos formas',
  variantes.length === 0,
  variantes.map((v) => v.join(' / ')).join('; '),
);

// Ordenado por frecuencia: es lo que hace legible la lista.
const ordenado = stack.every((s, i) => i === 0 || stack[i - 1].usos >= s.usos);
check('stack ordenado por frecuencia', ordenado);

console.log('\nRutas');
const leer = (f) => (existsSync(join(DIST, f)) ? readFileSync(join(DIST, f), 'utf8') : '');

// El sitio se navega por URL, no solo desde la terminal. Cada sección tiene que
// responder por su cuenta.
// Sin 404.html, Cloudflare Pages responde a CUALQUIER ruta inexistente con
// index.html y estado 200: infinitas URLs sirviendo lo mismo, que para un
// buscador es contenido duplicado, y ningún enlace roto se detecta jamás.
check('404.html generada', existsSync(join(DIST, '404.html')), 'sin ella toda ruta inventada responde 200');

for (const sec of SECCIONES_SLUGS) {
  check(`/${sec} generada`, existsSync(join(DIST, `${sec}.html`)));
}

// Sin JavaScript la página tiene que traer su contenido. Es la diferencia entre
// una página que un buscador lee y una que ve vacía. «panel» es la clase que
// render.ts pone en cada tarjeta (ver `panel()` en src/lib/render.ts): es
// marcado del sitio, no contenido del CMS, así que sí puede nombrarse aquí.
const proyectos = leer('proyectos.html');
check(
  '/proyectos trae su contenido sin JavaScript',
  proyectosSrc.length > 0 &&
    proyectosSrc.every((p) => proyectos.includes(p.data.titulo)) &&
    proyectos.includes('panel'),
  proyectosSrc.length === 0 ? 'no hay proyectos para probar esta comprobación' : '',
);
const sobreMi = leer('sobre-mi.html');
check(
  '/sobre-mi trae experiencia y stack sin JavaScript',
  !!experienciaConStack &&
    sobreMi.includes(experienciaConStack.data.organizacion) &&
    experienciaConStack.data.st.some((t) => sobreMi.includes(t)),
  experienciaConStack ? '' : 'no hay ninguna experiencia con stack propio para probar esta comprobación',
);

// El sitio se navega por enlace tanto como por comando: un href que apunta a
// nada es invisible hasta que alguien hace clic. `build.format: 'file'` sirve
// cada ruta como <ruta>.html salvo la raíz y los recursos estáticos, que ya
// tienen su propia extensión y viven tal cual en dist/.
const enlacesRotos = [];
for (const archivo of paginasHtml) {
  const contenido = readFileSync(archivo, 'utf8');
  const hrefs = [...contenido.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);
  for (const href of hrefs) {
    if (href.startsWith('http')) continue; // externo: fuera del barrido
    const sinAncla = href.split('#')[0];
    if (!sinAncla) continue; // era solo un ancla, «#lo-que-sea»
    // Un archivo de /media/ con espacios (u otro carácter fuera de lo
    // "seguro") en el nombre llega acá codificado (rutaMedia(), en
    // src/lib/render.ts): hay que decodificarlo antes de buscarlo en disco,
    // donde vive con su nombre real, sin el %20.
    let sinCodificar;
    try {
      sinCodificar = decodeURI(sinAncla);
    } catch {
      sinCodificar = sinAncla;
    }
    const destino =
      sinCodificar === '/'
        ? 'index.html'
        : extname(sinCodificar)
          ? sinCodificar.slice(1)
          : sinCodificar.slice(1) + '.html';
    if (!existsSync(join(DIST, destino))) {
      enlacesRotos.push(`${relative(DIST, archivo)} → ${href}`);
    }
  }
}
check(
  'todo enlace interno resuelve',
  enlacesRotos.length === 0,
  `${enlacesRotos.length} rotos — ` +
    [...new Set(enlacesRotos)].slice(0, 6).join(' · ') +
    (enlacesRotos.length > 6 ? ' …' : ''),
);

console.log('\nAccesibilidad');
// Estas cuatro comprobaciones vienen del barrido manual de axe-core y del
// recorrido por teclado del QA de 2026-09-15: automatizan lo que ese barrido
// encontró para que no vuelva a colarse en silencio.

// `dist/index.html` sí tenía su h1, y esa fue la única página que se miraba.
// Las otras tres compilaban igual de verdes sin ningún encabezado de primer
// nivel: WCAG 1.3.1 y 2.4.6 exigen exactamente uno por documento.
const sinUnH1 = paginasHtml
  .map((ruta) => ({
    ruta: relative(DIST, ruta),
    n: (readFileSync(ruta, 'utf8').match(/<h1[\s>]/g) || []).length,
  }))
  .filter((p) => p.n !== 1);
check(
  'exactamente un h1 en cada página',
  sinUnH1.length === 0,
  sinUnH1.map((p) => `${p.ruta} (${p.n})`).join(', '),
);

// Fórmula de contraste de WCAG 2.1: cada canal sRGB (0-255) se normaliza a
// 0-1, se linealiza (curva gamma ~2.4, con tramo lineal bajo 0.03928) y se
// pondera 0.2126/0.7152/0.0722 para R/G/B — la luminancia relativa L. El
// contraste entre dos colores es (L1+0.05)/(L2+0.05), con L1 el más claro.
function luminanciaRelativa(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linealizar = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linealizar(r) + 0.7152 * linealizar(g) + 0.0722 * linealizar(b);
}
function contraste(hexA, hexB) {
  const [claro, oscuro] = [luminanciaRelativa(hexA), luminanciaRelativa(hexB)].sort((a, b) => b - a);
  return (claro + 0.05) / (oscuro + 0.05);
}

const tokensCss = readFileSync('src/styles/tokens.css', 'utf8');
const leerToken = (nombre) =>
  (tokensCss.match(new RegExp(`--${nombre}:\\s*(#[0-9a-fA-F]{6})`)) || [])[1] ?? '';
const bg = leerToken('bg');
for (const token of ['fg', 'muted', 'dim', 'prose']) {
  const hex = leerToken(token);
  const ratio = hex && bg ? contraste(hex, bg) : 0;
  check(
    `--${token} contra --bg ≥ 4.5:1 (WCAG 1.4.3 AA)`,
    ratio >= 4.5,
    `${hex || '¿?'} sobre ${bg || '¿?'}: ${ratio.toFixed(2)}:1`,
  );
}

// Comprobar solo contra --bg deja un hueco: la barra de estado no vive sobre
// --bg sino sobre --panel, que es más claro, y un token que pasa sobre el
// fondo oscuro puede fallar ahí. Por ese hueco se coló el reloj a 4.18:1 el
// 2026-09-15. Los tokens no se listan a mano: se leen de las propias reglas
// .status, para que una regla nueva entre sola en la comprobación.
const panel = leerToken('panel');
const statuslineAstro = readFileSync('src/components/Statusline.astro', 'utf8');
const tokensSobrePanel = [
  ...new Set(
    (statuslineAstro.match(/\.status[^{]*\{[^}]*\}/g) ?? [])
      .flatMap((regla) => [...regla.matchAll(/color:\s*var\(--([a-z0-9-]+)\)/g)])
      .map((m) => m[1]),
  ),
];
for (const token of tokensSobrePanel) {
  const hex = leerToken(token);
  // Un token que no es un color literal de tokens.css no se puede medir aquí.
  if (!hex) continue;
  const ratio = panel ? contraste(hex, panel) : 0;
  check(
    `--${token} contra --panel ≥ 4.5:1 (barra de estado, WCAG 1.4.3 AA)`,
    ratio >= 4.5,
    `${hex} sobre ${panel || '¿?'}: ${ratio.toFixed(2)}:1`,
  );
}

// El mismo hueco, en la barra lateral: el subtítulo de cada fila se mide sobre
// --bg, pero la fila actual se pinta sobre --sel y la fila bajo el puntero o
// con foco sobre --panel, los dos más claros. El QA de 2026-09-17 midió el
// subtítulo de la fila actual a 3.11:1. El color efectivo es el de la regla
// más específica que exista para ese estado; si no hay, el de la regla base.
// Sin comentarios: el que precede a una regla quedaría pegado a su selector.
const sidebarCss = readFileSync('src/styles/sidebar.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const colorDe = (selector) => {
  const reglas = [...sidebarCss.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, sel]) =>
    sel.split(',').map((s) => s.trim()).includes(selector),
  );
  const colores = reglas.flatMap(([, , cuerpo]) => [...cuerpo.matchAll(/(?:^|[;\s])color:\s*var\(--([a-z0-9-]+)\)/g)]);
  return colores.at(-1)?.[1];
};
for (const [fila, sub] of [['ws', 'ws-sub'], ['ab', 'ab-sub']]) {
  // Cada estado lista sus selectores del más al menos específico: la fila
  // actual bajo el puntero conserva --sel, y ahí la regla de :hover ganaría a
  // la de la fila actual si esta no la nombrara también.
  for (const [estado, selectores, fondo] of [
    ['actual', [`.${fila}-actual .${sub}`], 'sel'],
    ['actual bajo el puntero', [`.${fila}-actual:hover .${sub}`, `.${fila}-item:hover .${sub}`], 'sel'],
    ['bajo el puntero', [`.${fila}-item:hover .${sub}`], 'panel'],
    ['con foco', [`.${fila}-item:focus-visible .${sub}`], 'panel'],
  ]) {
    const token = [...selectores, `.${sub}`].map(colorDe).find(Boolean);
    const hex = token ? leerToken(token) : '';
    const hexFondo = leerToken(fondo);
    const ratio = hex && hexFondo ? contraste(hex, hexFondo) : 0;
    check(
      `.${sub} en fila ${estado} contra --${fondo} ≥ 4.5:1 (barra lateral, WCAG 1.4.3 AA)`,
      ratio >= 4.5,
      `--${token ?? '¿?'} ${hex || '¿?'} sobre ${hexFondo || '¿?'}: ${ratio.toFixed(2)}:1`,
    );
  }
}

console.log('\nContraste no textual en glifos decorativos (WCAG 1.4.11, guarda propia)');
// .ws-glifo/.ab-glifo y el pre del banner llevan aria-hidden en la plantilla
// (Sidebar.astro, Terminal.astro); .rule y .brain no lo llevan todavía, pero
// tampoco transmiten información propia — repiten en símbolos lo que el texto
// de al lado ya dice. axe no calcula contraste sobre ninguno de los cinco (el
// glifo lo pinta un script, o su color depende de una clase de estado), así
// que esta comprobación no reemplaza a axe: existe para que un cambio de
// token futuro no los deje invisibles en silencio, no porque axe lo exija hoy.
const sel = leerToken('sel');

function colorTokenPara(cssTexto, selector) {
  const reglas = [...cssTexto.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, listaSel]) =>
    listaSel.split(',').map((s) => s.trim()).includes(selector),
  );
  const colores = reglas.flatMap(([, , cuerpo]) => [...cuerpo.matchAll(/(?:^|[;\s])color:\s*var\(--([a-z0-9-]+)\)/g)]);
  return colores.at(-1)?.[1];
}

function noTextual(nombre, token, fondoNombre) {
  const hex = token ? leerToken(token) : '';
  const hexFondo = leerToken(fondoNombre);
  const ratio = hex && hexFondo ? contraste(hex, hexFondo) : 0;
  check(
    `${nombre} ≥ 3:1 contra --${fondoNombre} (WCAG 1.4.11)`,
    ratio >= 3,
    `--${token ?? '¿?'} ${hex || '¿?'} sobre ${hexFondo || '¿?'}: ${ratio.toFixed(2)}:1`,
  );
}

noTextual('.ws-glifo/.ab-glifo (estado base)', colorDe('.ws-glifo'), 'bg');
noTextual('.ws-actual .ws-glifo/.ab-actual .ab-glifo (fila actual)', colorDe('.ws-actual .ws-glifo'), 'sel');
noTextual('.ws-visitada .ws-glifo (visitado)', colorDe('.ws-visitada .ws-glifo'), 'bg');

const terminalAstroCss = (
  readFileSync('src/components/Terminal.astro', 'utf8').match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? ''
).replace(/\/\*[\s\S]*?\*\//g, '');
noTextual('.rule (separador del panel de arranque)', colorTokenPara(terminalAstroCss, '.info .rule'), 'bg');
noTextual('.logo (banner pre)', colorTokenPara(terminalAstroCss, '.logo'), 'bg');

const terminalCssSrc = readFileSync('src/styles/terminal.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
noTextual('.brain.ok (símbolo del prompt)', colorTokenPara(terminalCssSrc, '.brain.ok'), 'bg');
noTextual('.brain.err (símbolo del prompt)', colorTokenPara(terminalCssSrc, '.brain.err'), 'bg');

// Comprobación estructural por expresión regular: no sustituye una prueba real
// de teclado en el navegador (foco, Shift+Tab, salida hacia los enlaces), solo
// evita la regresión concreta de 2026-09-15: que el bloque de Tab vuelva a
// llamar preventDefault() sin haber comprobado antes una guarda de salida.
// Se lee el archivo acá y no del `tsScript` de más abajo porque esa constante
// todavía no existe en este punto del script.
const terminalTs = existsSync('src/scripts/terminal.ts')
  ? readFileSync('src/scripts/terminal.ts', 'utf8')
  : '';
// Al cargar, la salida ya viene escrita por el servidor, así que desplazarse
// al prompt deja a quien llega en la mitad del texto: en el inicio eran 251 px
// hacia abajo. push() tiene que llevar el desplazamiento solo cuando ya hay
// alguien escribiendo comandos, no durante el arranque. Comprobación
// estructural: no sustituye la prueba en el navegador, solo evita que la
// guarda desaparezca sin que nadie lo note.
const cuerpoPush = (terminalTs.match(/const push = \([^)]*\) => \{([\s\S]*?)\n\};/) || [])[1] || '';
check(
  'el desplazamiento automático no corre durante el arranque',
  /scrollTop/.test(cuerpoPush) && /\bif\s*\([^)]*\)/.test(cuerpoPush.slice(0, cuerpoPush.indexOf('scrollTop'))),
  cuerpoPush.trim() || '(no se encontró push())',
);

// Un .ts sin import ni export es, para TypeScript, un script global: sus
// variables comparten ámbito con las de los demás y dos scripts que declaren
// el mismo nombre no compilan (ts2451). Pasó entre visor.ts y sidebar.ts con
// `botonCerrar`, y lo vio el CI, no el build: acá se ataja antes.
// El panel guarda un campo opcional vacío como `''` y no lo omite, así que un
// `.optional()` a secas rechaza lo que el propio panel escribe: pasó con
// `url: ''` en certificaciones y, con el verificador corriendo en el build de
// Cloudflare, bloqueó la publicación de todo lo demás. Cada campo opcional
// tiene que pasar por el ayudante `opcional()`, que normaliza el vacío antes
// de validar. La única aparición legítima de `.optional()` es la de su propia
// definición.
const configContenido = readFileSync('src/content.config.ts', 'utf8');
const optionalesSueltos = configContenido
  .split('\n')
  .map((linea, i) => ({ n: i + 1, linea }))
  .filter(({ linea }) => linea.includes('.optional()') && !linea.includes('esquema.optional()'));
check(
  'cada campo opcional del esquema acepta el vacío que escribe el panel',
  optionalesSueltos.length === 0,
  optionalesSueltos.map(({ n, linea }) => `línea ${n}: ${linea.trim()}`).join(' · '),
);

const scriptsSueltos = readdirSync('src/scripts')
  .filter((n) => n.endsWith('.ts'))
  .filter((n) => !/^\s*(import|export)\b/m.test(readFileSync(join('src/scripts', n), 'utf8')));
check(
  'cada script del sitio es un módulo, no un script global',
  scriptsSueltos.length === 0,
  scriptsSueltos.join(', ') + ' — sin import ni export comparten ámbito global',
);

const desdeTab = terminalTs.slice(terminalTs.indexOf("if (ev.key === 'Tab')"));
const bloqueTab = desdeTab.slice(0, desdeTab.indexOf("if (ev.key === 'ArrowUp'"));
const idxReturn = bloqueTab.search(/\breturn\b/);
const idxPreventDefault = bloqueTab.indexOf('ev.preventDefault()');
check(
  'Tab no se secuestra incondicionalmente',
  idxPreventDefault === -1 || (idxReturn !== -1 && idxReturn < idxPreventDefault),
  'preventDefault() se llama antes de comprobar ninguna guarda: Shift+Tab también queda atrapado',
);

// Una publicación sin cuerpo propio no genera página. Si la generara, sería un
// título repetido compitiendo con el original del editor (ver tieneCuerpo() en
// src/lib/content.ts y el filtro en publicaciones/[slug].astro). La regla se
// deriva de src/content/publicaciones/*.md, no de una publicación concreta:
// funciona igual si el CMS agrega, quita o le pone cuerpo a cualquier entrada.
const sitemap = leer('sitemap-0.xml');
const publicaciones = leer('publicaciones.html');

const publicacionesConCuerpo = publicacionesSrc.filter(tieneCuerpoFuente);
const publicacionesSinCuerpo = publicacionesSrc.filter((p) => !tieneCuerpoFuente(p));

const sinCuerpoConPagina = publicacionesSinCuerpo.filter((p) =>
  existsSync(join(DIST, 'publicaciones', `${p.id}.html`)),
);
check(
  'ninguna publicación sin cuerpo genera página propia',
  sinCuerpoConPagina.length === 0,
  publicacionesSinCuerpo.length === 0
    ? 'no hay publicaciones sin cuerpo en este build'
    : sinCuerpoConPagina.map((p) => p.id).join(', '),
);

const conCuerpoSinPagina = publicacionesConCuerpo.filter(
  (p) => !existsSync(join(DIST, 'publicaciones', `${p.id}.html`)),
);
check(
  'toda publicación con cuerpo genera su página propia',
  conCuerpoSinPagina.length === 0,
  publicacionesConCuerpo.length === 0
    ? 'no hay publicaciones con cuerpo en este build'
    : conCuerpoSinPagina.map((p) => p.id).join(', '),
);

const sinCuerpoEnSitemap = publicacionesSinCuerpo.filter((p) => sitemap.includes(p.id));
check(
  'las publicaciones sin cuerpo no están en el sitemap',
  sinCuerpoEnSitemap.length === 0,
  publicacionesSinCuerpo.length === 0
    ? 'no hay publicaciones sin cuerpo en este build'
    : sinCuerpoEnSitemap.map((p) => p.id).join(', '),
);

const conCuerpoFueraDeSitemap = publicacionesConCuerpo.filter((p) => !sitemap.includes(p.id));
check(
  'las publicaciones con cuerpo sí están en el sitemap',
  conCuerpoFueraDeSitemap.length === 0,
  publicacionesConCuerpo.length === 0
    ? 'no hay publicaciones con cuerpo en este build'
    : conCuerpoFueraDeSitemap.map((p) => p.id).join(', '),
);

// El DOI solo aparece como enlace en el índice para una publicación SIN
// página propia (panel() en src/lib/render.ts prioriza el enlace a la página
// propia sobre el enlace externo): una con cuerpo lo muestra en su propia
// página, no en la fila del índice. Por eso esta comprobación se limita a las
// publicaciones sin cuerpo, no a todas.
const publicacionesSinDoiEnIndice = publicacionesSinCuerpo
  .filter((p) => p.data.doi)
  .filter((p) => !publicaciones.includes(`doi.org/${p.data.doi}`));
check(
  'toda publicación sin página propia muestra su DOI en el índice',
  publicacionesSinDoiEnIndice.length === 0,
  publicacionesSinCuerpo.some((p) => p.data.doi)
    ? publicacionesSinDoiEnIndice.map((p) => p.id).join(', ')
    : 'no hay publicaciones sin cuerpo con doi en este build',
);

// Una página de tecnología con un solo uso no dice nada que la lista de origen
// no diga ya.
const conPagina = stack.filter((s) => s.usos >= 2).map((s) => s.tech);
const paginasStack = existsSync(join(DIST, 'stack'))
  ? readdirSync(join(DIST, 'stack')).filter((f) => f.endsWith('.html'))
  : [];
check(
  'una página de stack por cada tecnología con 2+ usos',
  paginasStack.length === conPagina.length,
  `${paginasStack.length} páginas para ${conPagina.length} tecnologías`,
);
const soloUno = stack.filter((s) => s.usos < 2).length;
check('ninguna página para las de un solo uso', soloUno > 0 && paginasStack.length < stack.length);

console.log('\nStack: contexto de cada fuente y comando de la terminal');
// El QA de 2026-09-17 encontró dos fallos en /stack/<tech>: cada fuente era un
// enlace desnudo sin decir nada que la lista de origen no dijera ya, y la
// terminal mostraba «cd sobre-mi» — la sección que sidebar.ts usa para marcar
// el padre en la barra lateral, no la página en la que realmente se está.
const stackDirDist = join(DIST, 'stack');
const sinDetalleEnFuente = [];
const conCdSobreMi = [];
for (const nombre of paginasStack) {
  const contenido = readFileSync(join(stackDirDist, nombre), 'utf8');
  // Astro marca con data-astro-cid-* cada etiqueta de un componente con
  // <style>: los selectores no pueden asumir el atributo exacto que trae cada
  // etiqueta, solo que existe alguno.
  const bloqueFuentes = contenido.match(/<ul class="fuentes"[^>]*>[\s\S]*?<\/ul>/)?.[0] ?? '';
  const filas = bloqueFuentes.match(/<li[^>]*>[\s\S]*?<\/li>/g) ?? [];
  const filasSinDetalle = filas.filter((li) => !/class="fuente-detalle"[^>]*>\s*\S/.test(li));
  if (filas.length > 0 && filasSinDetalle.length > 0) sinDetalleEnFuente.push(`${nombre} (${filasSinDetalle.length})`);

  const lineaComando = contenido.match(/<div class="out done"[^>]*>[\s\S]*?<\/div>/)?.[0] ?? '';
  if (/<span class="typed"[^>]*>cd sobre-mi<\/span>/.test(lineaComando)) conCdSobreMi.push(nombre);
}
check(
  'cada fuente de una página de stack trae su línea de contexto',
  paginasStack.length > 0 && sinDetalleEnFuente.length === 0,
  sinDetalleEnFuente.join(', '),
);
check(
  'ninguna página de stack muestra «cd sobre-mi» como comando ejecutado',
  paginasStack.length > 0 && conCdSobreMi.length === 0,
  conCdSobreMi.join(', '),
);

// El número que se ve y el número al que se llama tienen que ser el mismo.
// Escribirlos por separado es cómo dejan de serlo.
const contacto = leer('contacto.html');
const wa = (contacto.match(/wa\.me\/(\d+)/) || [])[1] || '';
const visible = (contacto.match(/\+(\d[\d\s]+\d)/) || [])[1] || '';
check('el enlace de WhatsApp existe', wa.length > 0);
check(
  'el número visible es el número del enlace',
  wa.length > 0 && wa === visible.replace(/\s/g, ''),
  `enlace ${wa} · visible ${visible}`,
);

console.log('\nContacto: el texto de cada enlace no repite su propia etiqueta');
// El enlace de LinkedIn mostraba «linkedin», la misma palabra que ya está en
// la celda de la izquierda: no aporta nada que la etiqueta no dijera ya, a
// diferencia de github, que sí muestra el destino (github.com/<usuario>).
const filasContacto = [
  ...contacto.matchAll(/<td class="n">([^<]*)<\/td>\s*<td class="d">\s*<a[^>]*>([^<]*)<\/a>/g),
];
const enlacesRedundantes = filasContacto.filter(
  ([, etiqueta, texto]) => etiqueta.trim().toLowerCase() === texto.trim().toLowerCase(),
);
check(
  'ningún texto de enlace de contacto repite su propia etiqueta',
  filasContacto.length > 0 && enlacesRedundantes.length === 0,
  enlacesRedundantes.map(([, etiqueta]) => etiqueta).join(', '),
);

console.log('\nStack visual');
const sm = leer('sobre-mi.html');

// Si alguna vez aparece un porcentaje, es que el número se inventó.
check('sin porcentajes de dominio', !/\b\d{1,3}\s*%/.test(sm), 'ese número no sale de ningún dato');

console.log('\nStack: mapa de calor');
// El mapa de calor reemplaza las 29 filas con barra por una cuadrícula donde
// el color codifica los usos. Sin el número escrito dentro de la celda, ese
// color sería la única forma de leerlo — justo lo que WCAG 1.4.1 prohíbe.
const bloqueHeat = sm.match(/<ul class="stack-heat">[\s\S]*?<\/ul>/)?.[0] ?? '';
const celdasHtml = [...bloqueHeat.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
check('el mapa de calor se pinta como lista', celdasHtml.length > 0, `${celdasHtml.length} celdas`);
check(
  'cada tecnología del índice tiene exactamente una celda',
  celdasHtml.length === stack.length,
  `${celdasHtml.length} celdas ≠ ${stack.length} tecnologías`,
);

// El color nunca es la única forma de leer el número: tiene que estar también
// como texto dentro de la celda.
const celdasSinNumero = celdasHtml.filter((c) => !/<span class="stack-usos">\d+ usos?<\/span>/.test(c));
check(
  'ninguna celda depende solo del color: el número también va como texto',
  celdasSinNumero.length === 0,
  `${celdasSinNumero.length} sin número`,
);

// El número escrito en cada celda tiene que coincidir con stack.json: dos
// fuentes del mismo dato que se puedan desincronizar es peor que una sola.
// Mismo esc() que src/lib/render.ts: el nombre en el HTML sale escapado y hay
// que escapar igual el de stack.json antes de comparar.
function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
const celdasDatos = [
  ...bloqueHeat.matchAll(/<span class="stack-nombre">([^<]*)<\/span><span class="stack-usos">(\d+) usos?<\/span>/g),
].map(([, nombre, usos]) => ({ nombre, usos: Number(usos) }));
const conteoEsperado = new Map(stack.map((s) => [esc(s.tech), s.usos]));
const celdasDesalineadas = celdasDatos.filter(({ nombre, usos }) => conteoEsperado.get(nombre) !== usos);
check(
  'el número de cada celda coincide con stack.json',
  celdasDatos.length === stack.length && celdasDesalineadas.length === 0,
  celdasDesalineadas.map((c) => c.nombre).join(', '),
);

// Solo una tecnología con página propia (2+ usos, ver MINIMO_PARA_PAGINA_DE_STACK
// en src/lib/content.ts) es un enlace; el resto es una celda sin afordancia.
// El nombre accesible de cada enlace lleva el número adentro: no hace falta
// ver el color de fondo para saber cuántos usos tiene.
const enlacesCelda = [
  ...bloqueHeat.matchAll(/<a class="stack-celda nivel-\d" href="[^"]+" aria-label="([^"]+)">/g),
].map((m) => m[1]);
check(
  'las tecnologías con página propia son enlaces en el mapa de calor',
  enlacesCelda.length === conPagina.length,
  `${enlacesCelda.length} enlaces ≠ ${conPagina.length} con página`,
);
check(
  'el nombre accesible de cada enlace incluye el número de usos',
  enlacesCelda.length > 0 && enlacesCelda.every((label) => /\d+ usos?/.test(label)),
);

console.log('\nStack: escala de color');
const NIVELES = [1, 2, 3, 4, 5];
const nivelesFaltantes = NIVELES.filter(
  (n) => !new RegExp(`--nivel-${n}:\\s*#[0-9a-fA-F]{6}`).test(tokensSrc),
);
check('los cinco tokens --nivel-* existen en tokens.css', nivelesFaltantes.length === 0, nivelesFaltantes.join(', '));

const fgToken = leerToken('fg');
for (const n of NIVELES) {
  const hexNivel = leerToken(`nivel-${n}`);
  const ratioNivel = hexNivel && fgToken ? contraste(fgToken, hexNivel) : 0;
  check(
    `--fg sobre --nivel-${n} ≥ 4.5:1 (WCAG 1.4.3 AA)`,
    ratioNivel >= 4.5,
    `${fgToken || '¿?'} sobre ${hexNivel || '¿?'}: ${ratioNivel.toFixed(2)}:1`,
  );
}

// Ni un nivel de más que nadie pueda alcanzar (.nivel-6...) ni uno de menos
// que el CSS use sin declararlo en tokens.css.
const nivelesEnCss = new Set([...css.matchAll(/\.nivel-(\d+)\b/g)].map((m) => Number(m[1])));
check(
  'el CSS usa exactamente los niveles que declara (nada de .nivel-6, ninguno sin usar)',
  [...nivelesEnCss].every((n) => NIVELES.includes(n)) && NIVELES.every((n) => nivelesEnCss.has(n)),
  `en CSS: ${[...nivelesEnCss].sort().join(', ')}`,
);

// El nivel más oscuro mide 1.13:1 contra --bg: sin borde propio, esa celda
// desaparece contra la página.
check(
  'cada celda del mapa de calor lleva un borde visible',
  /\.stack-celda\s*\{[^}]*border:\s*1px solid var\(--line\)/.test(css),
);

const bloqueLeyenda = sm.match(/<ul class="stack-leyenda">[\s\S]*?<\/ul>/)?.[0] ?? '';
const pasosLeyenda = [...bloqueLeyenda.matchAll(/nivel-(\d)/g)].map((m) => Number(m[1]));
check(
  'la leyenda muestra los cinco pasos de la escala',
  NIVELES.every((n) => pasosLeyenda.includes(n)) && pasosLeyenda.length === 5,
  `pasos encontrados: ${pasosLeyenda.join(', ')}`,
);
check('la leyenda marca el último paso como «5+»', /5\+/.test(bloqueLeyenda));
// El texto de la leyenda no puede ir en el color de la propia serie: ese color
// ya lo lleva el recuadro de al lado.
check(
  'el texto de la leyenda usa un token de texto, no el de la serie',
  /\.stack-leyenda-t\s*\{[^}]*color:\s*var\(--(dim|muted|fg|prose)\)/.test(css),
);

// Los iconos son caracteres de la fuente empaquetada, no imágenes: no tocan
// img-src, escalan y heredan el color del texto.
check('los iconos son texto, no imágenes', /class="ico"/.test(sm) && !/<img/.test(sm));
check('los iconos no los lee un lector de pantalla', /class="ico" aria-hidden="true"/.test(sm));

// Un codepoint del Área de Uso Privado que no esté en la fuente sale como
// cuadrado vacío, y nada avisa.
const declarados = [
  ...readFileSync('src/data/iconos.ts', 'utf8').matchAll(/\\u([0-9A-Fa-f]{4})/g),
].map((m) => parseInt(m[1], 16));
check('hay iconos declarados', declarados.length > 0, `${declarados.length}`);
const usadosEnHtml = [...sm.matchAll(/<span class="ico"[^>]*>(.)</g)].map((m) =>
  m[1].codePointAt(0),
);
check(
  'todo icono que se pinta está declarado',
  usadosEnHtml.every((c) => declarados.includes(c)),
  'un codepoint sin glifo sale como cuadrado vacío',
);

console.log('\nPáginas en Markdown');
// La prosa se escribe libre; los bloques de datos los arma el sitio. Así lo que
// se calcula no se puede desincronizar escribiéndolo a mano.
check('la prosa de sobre-mí viene de un Markdown', existsSync('src/content/paginas/sobre-mi.md'));
check('la de contacto también', existsSync('src/content/paginas/contacto.md'));
check('la prosa llega procesada al HTML', /class="prose intro"/.test(sm));
check(
  'el stack sigue saliendo de los datos, no del Markdown',
  !readFileSync('src/content/paginas/sobre-mi.md', 'utf8').includes('█'),
  'si el Markdown dibujara el stack, dejaría de contarse solo',
);

console.log('\nLector');
// «El primer proyecto» sirve para probar cualquier propiedad estructural de
// una página de detalle: cuál sea no importa, solo que exista.
const primerProyecto = proyectosSrc[0];
const art = primerProyecto ? leer(`proyectos/${primerProyecto.id}.html`) : '';
check(
  'la página de artículo se genera',
  proyectosSrc.length > 0 && art.length > 0,
  proyectosSrc.length === 0 ? 'no hay proyectos en este build' : '',
);

// El cuerpo lo procesa Astro al compilar. Si apareciera un analizador de
// Markdown en el cliente, serían kilobytes enviados para hacer dos veces algo
// que ya está hecho.
check(
  'el cuerpo llega procesado, no en Markdown',
  art.includes('<h2') && !art.includes('## Acceso'),
);
check('sin analizador de Markdown en el cliente', !/marked|markdown-it|remark|micromark/i.test(js));

// La medida acotada es lo que hace legible la prosa monoespaciada. El problema
// nunca fue la fuente, fue el largo de renglón.
check('la prosa tiene medida acotada', /\.prose\s*\{[^}]*max-width:\s*64ch/.test(css));

// El aire ANTES de un encabezado es varias veces el de un párrafo y el de
// DESPUÉS es mínimo: eso agrupa cada sección con su texto. Con un espaciado
// uniforme el texto se lee plano por buena que sea la tipografía.
const h2Antes = (css.match(/\.prose h2\s*\{\s*margin-top:\s*([\d.]+)em/) || [])[1];
const h2Despues = (css.match(/\.prose h2\s*\+\s*\*\s*\{\s*margin-top:\s*([\d.]+)em/) || [])[1];
check(
  'ritmo vertical: más aire antes del encabezado que después',
  h2Antes && h2Despues && Number(h2Antes) > Number(h2Despues) * 2,
  `antes ${h2Antes}em, después ${h2Despues}em`,
);

// Cada salida lleva su tecla escrita. Una tecla que aparece en pantalla y no
// hace nada es peor que no ponerla.
const teclas = [...art.matchAll(/<kbd>([^<]+)<\/kbd>/g)].map((m) => m[1].trim());
check('el fin de artículo ofrece salidas', teclas.length > 0, teclas.join(' '));
check(
  'las teclas escritas las lee el script',
  /\.eof-acts a/.test(js) && /querySelector\(['"`]kbd['"`]\)/.test(js),
  'el HTML declara la tecla y el script la lee de ahí',
);

// Llegar al final y no tener a dónde ir es cuando alguien cierra la pestaña.
check('el artículo enlaza a su colección', art.includes('href="/proyectos"'));
// Anterior/siguiente son las dos primeras entradas de la colección ya
// ordenada, igual que vecinos() en src/lib/content.ts: la de índice 0 no tiene
// anterior, pero sí siguiente; la de índice 1 enlaza de vuelta a la 0. Con
// menos de dos proyectos no hay par que comprobar.
if (proyectosSrc.length >= 2) {
  const [p0, p1] = proyectosSrc;
  const html0 = leer(`proyectos/${p0.id}.html`);
  const html1 = leer(`proyectos/${p1.id}.html`);
  check(
    'los artículos se enlazan entre sí (anterior/siguiente)',
    html0.includes(`/proyectos/${p1.id}`) && html1.includes(`/proyectos/${p0.id}`),
    `${p0.id} ↔ ${p1.id}`,
  );
} else {
  skip('los artículos se enlazan entre sí (anterior/siguiente)', 'hay menos de dos proyectos para comparar');
}

console.log('\nAlcance del CSS en set:html');
// Lo que se inserta con set:html no recibe la marca de alcance de Astro, igual
// que lo que crea el script. Sus estilos tienen que estar sin alcance o la
// página se ve casi bien y nada avisa.
const INYECTADAS = [
  'panel',
  'panel-t',
  'panel-d',
  'chips',
  'chip',
  'panels',
  'row-go',
  'stack-heat',
  'stack-celda',
  'stack-nombre',
  'stack-usos',
  'stack-leyenda',
  'stack-leyenda-t',
  'stack-swatch',
  'nivel-1',
  'nivel-2',
  'nivel-3',
  'nivel-4',
  'nivel-5',
];
for (const cls of INYECTADAS) {
  const suelta = new RegExp('\\.' + cls + '(?![\\w-])(?!\\[data-astro-cid)');
  check(
    'sin alcance: .' + cls,
    suelta.test(css),
    'lo inserta set:html y nunca recibe la marca de alcance',
  );
}

console.log('\nTerminal');
// Los datos que la terminal necesita para navegar sin recargar. Si no se
// generan, cada comando cae a una navegación normal y nadie se entera de que
// la mitad de la fase no está haciendo nada.
const indicePath = join(DIST, 'indice.json');
check('indice.json generado', existsSync(indicePath));
const indice = existsSync(indicePath) ? JSON.parse(readFileSync(indicePath, 'utf8')) : {};
check(
  'el índice trae secciones, entradas y stack',
  Array.isArray(indice.secciones) && indice.entradas && Array.isArray(indice.stack),
);
check(
  'las entradas del índice son las mismas del sitio',
  (indice.entradas?.proyectos || []).length === proyectosSrc.length &&
    (indice.entradas?.publicaciones || []).length === publicacionesSrc.length,
  `índice: ${indice.entradas?.proyectos?.length ?? 0} proyectos, ${indice.entradas?.publicaciones?.length ?? 0} publicaciones · fuente: ${proyectosSrc.length} proyectos, ${publicacionesSrc.length} publicaciones`,
);

// El prototipo tenía href reales y ningún pushState: navegar dejaba la URL en
// la portada, así que nada era compartible ni indexable.
check('la navegación cambia la URL', /pushState/.test(js));
check('el botón atrás está atendido', /popstate/.test(js));
check(
  'el estado inicial entra al historial',
  /replaceState/.test(js),
  'sin él, el primer «atrás» tras navegar no tiene a dónde volver',
);

// Escribir sin saber qué se puede escribir es la barrera de entrada de
// cualquier terminal.
check('completado con Tab', /Tab/.test(js));
check('historial con las flechas', /ArrowUp/.test(js) && /ArrowDown/.test(js));
check('atajos de sección', /altKey/.test(js));

// El historial de comandos es de la sesión, no un dato que valga la pena
// conservar entre visitas.
check('el historial usa almacenamiento de sesión', /sessionStorage/.test(js));
check('sin almacenamiento persistente', !/localStorage/.test(js));

// La terminal se apoya en el índice, pero la página tiene que servir igual si
// ese índice no llega.
check(
  'la terminal cae a navegación normal sin el índice',
  /location\.href/.test(js),
  'si el índice falla, el servidor renderiza igual cada URL',
);

// El script vive en un .ts para que la verificación de tipos lo alcance. Dentro
// de un .astro no lo revisa nadie.
check('la terminal es un módulo aparte', existsSync('src/scripts/terminal.ts'));
const tsScript = existsSync('src/scripts/terminal.ts')
  ? readFileSync('src/scripts/terminal.ts', 'utf8')
  : '';
check(
  'el componente no lleva lógica suelta',
  readFileSync('src/components/Terminal.astro', 'utf8').includes("import '../scripts/terminal'"),
);
// Un `!` apaga la comprobación justo donde hace falta.
const bangs = tsScript.match(/\w!\.|\w!\)/g) || [];
check('sin aserciones que apaguen la verificación', bangs.length === 0, bangs.join(' '));

// El proyecto va en español neutro, en el producto y en la conversación.
const voseo = /\bprobá\b|\bmirá\b|\bfijate\b|\btenés\b|\bpodés\b|\bhacé\b|\bescribí\b/i;
check('sin voseo en la interfaz', !voseo.test(tsScript) && !voseo.test(html));

// Sin un enlace de vuelta al inicio en la barra lateral no hay forma de volver
// sin escribir un comando, y quien llega de un buscador no sabe que puede
// escribir. El workspace `~` es ese enlace.
check(
  'la barra lateral lleva un enlace de vuelta al inicio',
  /aria-label="Workspaces"[^>]*>[\s\S]*?href="\/"/.test(html),
);

// Sin flex-shrink: 0 el navegador le quita ancho a la barra lateral cuando
// falta espacio, y el texto de cada workspace se aprieta hasta ser ilegible.
check(
  'la barra lateral no puede encogerse',
  /\.sidebar[^{]*\{[^}]*flex:\s*0\s+0/.test(css),
  'sin flex: 0 0 la barra se encoge junto con el contenido',
);

console.log('\nSaltar al contenido (WCAG 2.4.1)');
// El QA de 2026-09-17 contó hasta 13 enlaces de la barra lateral antes del
// contenido en cada página. El primer elemento enfocable del <body> tiene que
// ser el enlace que lo salta, su destino tiene que existir y poder recibir el
// foco (un <main> sin tabindex no lo recibe en todos los navegadores), y el
// enlace tiene que verse al enfocarlo: uno invisible con foco es una trampa.
const sinSalto = paginasHtml
  .map((ruta) => {
    const doc = readFileSync(ruta, 'utf8');
    const cuerpo = doc.slice(doc.indexOf('<body'));
    const primero = cuerpo.match(/<(a|button|input|select|textarea)\b[^>]*>/)?.[0] ?? '';
    const destino = primero.match(/href="#([^"]+)"/)?.[1];
    const ok = destino && new RegExp(`id="${destino}"[^>]*tabindex="-1"|tabindex="-1"[^>]*id="${destino}"`).test(doc);
    return ok ? null : `${relative(DIST, ruta)} (${primero || 'sin enfocables'})`;
  })
  .filter(Boolean);
check('el primer enfocable de cada página salta al contenido', sinSalto.length === 0, sinSalto.join(' · '));
check(
  'el enlace de salto se ve al recibir el foco',
  /\.saltar:focus[^{]*\{[^}]*(clip-path:\s*none|position:\s*(static|fixed))/.test(css),
  'falta una regla .saltar:focus que lo saque de su escondite',
);

// En una pantalla táctil sin teclado, «q volver a proyectos» promete una tecla
// que no existe (QA 2026-09-17). La consulta es la misma con la que
// terminal.ts decide TOUCH: si divergen, una pantalla ve la pista y no tiene
// el atajo, o al revés.
const bloquesTactiles = [...css.matchAll(/@media\s*\(hover:\s*none\)\s*and\s*\(pointer:\s*coarse\)\s*\{([\s\S]*?\})\s*\}/g)].map(
  (m) => m[1],
);
check(
  'las pistas de teclado se ocultan en pantallas táctiles',
  bloquesTactiles.some((b) => /\.eof-acts kbd\s*\{[^}]*display:\s*none/.test(b)),
  'falta .eof-acts kbd { display: none } bajo (hover: none) and (pointer: coarse)',
);
check(
  'terminal.ts detecta lo táctil con la misma consulta',
  /matchMedia\('\(hover: none\) and \(pointer: coarse\)'\)/.test(terminalTs),
);

console.log('\nTítulo y encabezado (WCAG 2.4.2 / 1.3.1)');
// El QA de 2026-09-17 (hallazgo U2) encontró que `cd proyectos` no cambiaba ni
// el <title> ni el <h1>: la pestaña y el encabezado se quedaban con los de la
// portada. La causa era que cada página escribía su título y su lead a mano;
// ahora salen todos de SECCIONES/INICIO en content.ts, y esto comprueba que
// el HTML servido y el índice que consume la navegación sin recargar cuentan
// la misma historia.

check(
  'el índice trae título y lead para el inicio',
  typeof indice.inicio?.titulo === 'string' &&
    indice.inicio.titulo.length > 0 &&
    typeof indice.inicio?.lead === 'string' &&
    indice.inicio.lead.length > 0,
);

const seccionesSinTituloOLead = (indice.secciones || []).filter((s) => !s.titulo || !s.lead);
check(
  'el índice trae título y lead para cada sección',
  Array.isArray(indice.secciones) && indice.secciones.length > 0 && seccionesSinTituloOLead.length === 0,
  seccionesSinTituloOLead.map((s) => s.slug).join(', '),
);

function tituloDe(contenido) {
  return (contenido.match(/<title>([^<]*)<\/title>/) || [])[1] ?? '';
}
function leadDe(contenido) {
  const m = contenido.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  return m ? m[1] : '';
}

const PAGINAS_CON_TITULO_Y_LEAD = [
  ['index.html', indice.inicio],
  ['proyectos.html', (indice.secciones || []).find((s) => s.slug === 'proyectos')],
  ['publicaciones.html', (indice.secciones || []).find((s) => s.slug === 'publicaciones')],
  ['sobre-mi.html', (indice.secciones || []).find((s) => s.slug === 'sobre-mi')],
  ['contacto.html', (indice.secciones || []).find((s) => s.slug === 'contacto')],
];

const tituloMal = [];
const leadMal = [];
for (const [archivo, esperado] of PAGINAS_CON_TITULO_Y_LEAD) {
  const contenido = leer(archivo);
  const tituloEsperado = esperado?.titulo ?? '';
  const leadEsperado = esperado?.lead ?? '';
  const tituloReal = tituloDe(contenido);
  const leadReal = leadDe(contenido);
  if (!tituloEsperado || tituloReal !== tituloEsperado) {
    tituloMal.push(`${archivo}: "${tituloReal}" ≠ "${tituloEsperado}"`);
  }
  if (!leadEsperado || leadReal !== leadEsperado) {
    leadMal.push(`${archivo}: "${leadReal}" ≠ "${leadEsperado}"`);
  }
}
check('<title> de cada página coincide con el título del índice', tituloMal.length === 0, tituloMal.join(' · '));
check('el h1 de cada página coincide con el lead del índice', leadMal.length === 0, leadMal.join(' · '));

// Comprobación estructural por expresión regular: no sustituye una prueba real
// de teclado/lector de pantalla en el navegador, solo evita que `navegar()`
// vuelva a dejar el <title> y el <h1> de la página anterior tras `cd
// <sección>` o el botón «atrás» (el hallazgo U2 de arriba).
const desdeNavegar = tsScript.slice(tsScript.indexOf('function navegar('));
const cuerpoNavegar = desdeNavegar.slice(0, desdeNavegar.indexOf('\nfunction fragmento'));
check(
  'navegar() actualiza document.title y el h1 tras renderizar',
  /document\.title\s*=/.test(cuerpoNavegar) && /\.innerHTML\s*=/.test(cuerpoNavegar),
  'sin esto, cd <sección> deja la pestaña y el encabezado de la página anterior',
);

console.log('\nBarra lateral');
// El header de pestañas se reemplazó por una barra lateral inspirada en herdr:
// workspaces arriba, documentos abiertos abajo. Cada comprobación de acá existe
// porque se escribió en rojo antes de implementar la barra, siguiendo TDD.

const navSidebarSrc = '<nav[^>]*aria-label="Workspaces"[^>]*>[\\s\\S]*?<\\/nav>';
const WORKSPACES_ESPERADOS = ['/', ...SECCIONES_SLUGS.map((s) => `/${s}`)];

function navsDeWorkspaces(contenido) {
  return contenido.match(new RegExp(navSidebarSrc, 'g')) || [];
}

const navFaltanteOMultiple = [];
const navOrdenIncorrecto = [];
for (const archivo of paginasHtml) {
  const contenido = readFileSync(archivo, 'utf8');
  const navs = navsDeWorkspaces(contenido);
  if (navs.length !== 1) {
    navFaltanteOMultiple.push(`${relative(DIST, archivo)} (${navs.length})`);
    continue;
  }
  const hrefs = [...navs[0].matchAll(/<a[^>]*\shref="([^"]+)"/g)].map((m) => m[1]).slice(0, 5);
  if (JSON.stringify(hrefs) !== JSON.stringify(WORKSPACES_ESPERADOS)) {
    navOrdenIncorrecto.push(`${relative(DIST, archivo)}: ${hrefs.join(' ')}`);
  }
}
check(
  'cada página tiene exactamente un nav[aria-label="Workspaces"]',
  navFaltanteOMultiple.length === 0,
  navFaltanteOMultiple.join(', '),
);
check(
  'los 5 workspaces están en el orden y con las rutas correctas',
  navOrdenIncorrecto.length === 0,
  navOrdenIncorrecto.join(' · '),
);

function navWorkspacesDe(archivo) {
  const contenido = leer(archivo);
  return navsDeWorkspaces(contenido)[0] || '';
}
function actualesDe(navHtml) {
  return [...navHtml.matchAll(/<a[^>]*\shref="([^"]+)"[^>]*\saria-current="(page|location)"/g)];
}

// El workspace actual: exactamente uno por página, y el correcto. Las páginas
// de detalle marcan `location` sobre el workspace padre, no `page`: no son la
// raíz de la sección, son un documento dentro de ella. Los dos casos de
// detalle son «cualquier proyecto» y «cualquier tecnología con página propia»:
// cuál sea no importa, solo que exista al menos uno de cada tipo.
const primerProyectoArchivo = primerProyecto ? `proyectos/${primerProyecto.id}.html` : null;
const primeraPaginaStack = paginasStack.length > 0 ? `stack/${[...paginasStack].sort()[0]}` : null;
const CASOS_ACTUAL = [
  ['index.html', '/', 'page'],
  ['sobre-mi.html', '/sobre-mi', 'page'],
  ['proyectos.html', '/proyectos', 'page'],
  ...(primerProyectoArchivo ? [[primerProyectoArchivo, '/proyectos', 'location']] : []),
  ...(primeraPaginaStack ? [[primeraPaginaStack, '/sobre-mi', 'location']] : []),
  ['publicaciones.html', '/publicaciones', 'page'],
  ['contacto.html', '/contacto', 'page'],
];
if (!primerProyectoArchivo) skip('workspace actual en una página de detalle de proyecto', 'no hay proyectos en este build');
if (!primeraPaginaStack) skip('workspace actual en una página de detalle de tecnología', 'ninguna tecnología tiene página propia en este build');
const actualMal = [];
for (const [archivo, hrefEsperado, tipoEsperado] of CASOS_ACTUAL) {
  const actuales = actualesDe(navWorkspacesDe(archivo));
  const ok =
    actuales.length === 1 && actuales[0][1] === hrefEsperado && actuales[0][2] === tipoEsperado;
  if (!ok) {
    actualMal.push(`${archivo}: ${actuales.map((a) => a[1] + '=' + a[2]).join(',') || 'ninguno'}`);
  }
}
check(
  'exactamente un workspace actual por página, y el correcto',
  actualMal.length === 0,
  actualMal.join(' · '),
);

// «Abiertos»: una página de detalle se sirve a sí misma como el único
// «leyendo», sin depender de JavaScript. Una página de sección no tiene nada
// que ofrecer todavía: el estado vacío.
const abiertosListaSrc = '<ul[^>]*id="sidebar-abiertos-lista"[^>]*>[\\s\\S]*?<\\/ul>';
function abiertosDe(archivo) {
  return (leer(archivo).match(new RegExp(abiertosListaSrc)) || [])[0] || '';
}

const CASOS_DETALLE = [primerProyectoArchivo, primeraPaginaStack].filter(Boolean);
const detalleMal = CASOS_DETALLE.filter((a) => {
  const bloque = abiertosDe(a);
  const items = (bloque.match(/<li/g) || []).length;
  return items !== 1 || !/ab-actual/.test(bloque) || !/leyendo/.test(bloque);
});
check(
  'una página de detalle se sirve como el único «leyendo» en abiertos',
  detalleMal.length === 0,
  CASOS_DETALLE.length === 0 ? 'no hay ninguna página de detalle en este build' : detalleMal.join(', '),
);

const CASOS_SECCION = ['index.html', 'sobre-mi.html', 'proyectos.html', 'publicaciones.html', 'contacto.html'];
const seccionMal = CASOS_SECCION.filter((a) => {
  const bloque = abiertosDe(a);
  return !/nada abierto/.test(bloque) || /ab-actual/.test(bloque);
});
check(
  'una página de sección sirve el estado vacío de abiertos',
  seccionMal.length === 0,
  seccionMal.join(', '),
);

// Los conteos de cada subtítulo salen del índice, nunca escritos a mano: si se
// separan, el sitio miente sin que nadie lo haya escrito.
const nProyectosIdx = indice.entradas?.proyectos?.length ?? 0;
const nPublicacionesIdx = indice.entradas?.publicaciones?.length ?? 0;
const subProyectosEsperado = `${nProyectosIdx} ${nProyectosIdx === 1 ? 'proyecto' : 'proyectos'}`;
const subPublicacionesEsperado = `${nPublicacionesIdx} ${nPublicacionesIdx === 1 ? 'publicación' : 'publicaciones'}`;
const navInicio = navWorkspacesDe('index.html');
check(
  'el subtítulo de proyectos cuenta lo que hay en el índice',
  navInicio.includes(subProyectosEsperado),
  `se esperaba "${subProyectosEsperado}"`,
);
check(
  'el subtítulo de publicaciones cuenta lo que hay en el índice',
  navInicio.includes(subPublicacionesEsperado),
  `se esperaba "${subPublicacionesEsperado}"`,
);

// El header de pestañas es historia: si algo de su marcado sobrevive, es que
// quedó a medio migrar.
check('el header de pestañas desapareció', !/id="tabs"/.test(html) && !/class="marca"/.test(html));

// El guion del lado del cliente vive en su propio módulo, igual que la
// terminal, para que `tsc` lo revise.
const sidebarTsPath = 'src/scripts/sidebar.ts';
check('src/scripts/sidebar.ts existe', existsSync(sidebarTsPath));
const sidebarTs = existsSync(sidebarTsPath) ? readFileSync(sidebarTsPath, 'utf8') : '';
const totalSessionStorageSidebar = (sidebarTs.match(/sessionStorage\./g) || []).length;
const tryBlocksSidebar = sidebarTs.match(/try\s*\{[\s\S]*?\}\s*catch/g) || [];
const sessionStorageEnTry = tryBlocksSidebar.reduce(
  (n, b) => n + (b.match(/sessionStorage\./g) || []).length,
  0,
);
check(
  'todo acceso a sessionStorage en sidebar.ts va dentro de un try',
  totalSessionStorageSidebar > 0 && totalSessionStorageSidebar === sessionStorageEnTry,
  `${sessionStorageEnTry} de ${totalSessionStorageSidebar} dentro de un try`,
);

console.log('\nSidebar: nombre accesible solo con role (axe aria-prohibited-attr)');
// axe marca aria-prohibited-attr cuando un aria-label es estático sobre un
// elemento sin role: no hay «rol + nombre» que anunciar si no hay rol. El
// nombre solo tiene sentido mientras sidebar.ts declara role="dialog" para la
// cortina móvil (ver abrir()/cerrar() más abajo).
const sidebarConAriaEstatico = paginasHtml.filter((ruta) => {
  const etiqueta = readFileSync(ruta, 'utf8').match(/<div id="sidebar"[^>]*>/)?.[0] ?? '';
  return /\s(aria-label|aria-labelledby)=/.test(etiqueta);
});
check(
  'ningún #sidebar servido lleva aria-label/aria-labelledby estático',
  sidebarConAriaEstatico.length === 0,
  sidebarConAriaEstatico.map((r) => relative(DIST, r)).join(', '),
);

// Comprobación estructural sobre el fuente .ts, no una prueba de navegador:
// aquí no corre ningún script, solo se ata que aria-label se declare junto con
// role/aria-modal en el mismo bloque de apertura, y se retire junto con ellos
// en el mismo bloque de cierre — para que nunca quede el nombre sin el rol.
const bloqueAbrirSidebar = sidebarTs.slice(
  sidebarTs.indexOf('function abrir('),
  sidebarTs.indexOf('function cerrar('),
);
const bloqueCerrarSidebar = sidebarTs.slice(
  sidebarTs.indexOf('function cerrar('),
  sidebarTs.indexOf('function estaAbierta('),
);
check(
  'abrir() declara aria-label junto con role="dialog"',
  /setAttribute\('role',\s*'dialog'\)/.test(bloqueAbrirSidebar) &&
    /setAttribute\('aria-label',\s*'Menú'\)/.test(bloqueAbrirSidebar),
);
check(
  'cerrar() retira aria-label junto con role/aria-modal',
  /removeAttribute\('role'\)/.test(bloqueCerrarSidebar) &&
    /removeAttribute\('aria-modal'\)/.test(bloqueCerrarSidebar) &&
    /removeAttribute\('aria-label'\)/.test(bloqueCerrarSidebar),
);

console.log('\nBarra lateral (retoque visual)');
// Estas comprobaciones nacieron de una revisión visual sobre capturas de
// pantalla, no de una regresión de comportamiento: el HTML era válido y el
// script funcionaba, pero el navegador dibujaba viñetas y dos columnas con
// indentaciones distintas. Se leen contra la hoja de estilos porque ahí es
// donde vive el fallo — el marcado no deja ningún rastro de una lista sin
// resetear.

check(
  'las listas de la barra lateral resetean list-style',
  /\.sidebar\s+ul\s*\{[^}]*list-style:\s*none/.test(css),
  'sin el reseteo, el navegador dibuja • en cada fila (el fallo real: el nav de workspaces no llevaba la clase que traía el reseteo)',
);

// El mismo fallo se repitió dos veces en esta ronda: una regla de CSS
// correcta que apunta a una clase que el elemento nunca llevó. Esta
// comprobación ata el nav al selector real que usa su relleno, para que un
// tercer descuido de este tipo no vuelva a pasar en silencio.
check(
  'el nav de workspaces lleva la clase que le da su relleno',
  /<nav id="sidebar-workspaces" class="sidebar-workspaces"/.test(html),
  'sin la clase, .sidebar-workspaces { padding: ... } nunca se aplica y la fila queda pegada al borde',
);

// Desde que la marca es un dibujo, «JBMLL» ya no es el texto del enlace sino
// su nombre accesible: lo que esta comprobación protege es que la marca siga
// existiendo, nombrando al sitio y llevando al inicio, no la forma de
// escribirla.
check(
  'la marca JBMLL vuelve a estar en la barra lateral, enlazada al inicio',
  /<a class="sidebar-marca"[^>]*href="\/"/.test(marcaHtml) && /aria-label="[^"]*JBMLL/.test(marcaHtml),
  marcaHtml.slice(0, 100),
);

// La marca vive fuera del nav[aria-label="Workspaces"]: si estuviera dentro,
// sería un sexto enlace y rompería el orden de los cinco workspaces que ya
// comprueba la sección «Barra lateral».
check(
  'la marca no es parte de la lista de workspaces',
  !/sidebar-marca/.test(navInicio),
);

check(
  'la columna de glifo tiene un ancho fijo, igual en workspaces y abiertos',
  /\.ws-glifo\s*,\s*\.ab-glifo\s*\{[^}]*width:\s*2ch/.test(css),
  'sin un ancho compartido, ✓ y ◉ no alinean con el resto de la fila',
);

console.log('\nStatusline');

check(
  'la statusline ya no vive dentro de la columna de lectura (.wrap)',
  !/<div class="status">\s*<div class="wrap">/.test(html),
  '.wrap la centraba en una columna de 96ch, desalineada de la barra lateral',
);

check(
  'la statusline cuenta documentos abiertos, no un total de secciones escrito a mano',
  /id="st-abiertos"[^>]*>\d+\s+(?:abierto|abiertos)</.test(html) && !/\d+\s+secciones</.test(html),
);

// `clear` en una terminal vacía la pantalla. En un sitio web eso deja al
// visitante en un callejón sin salida, así que vuelve al inicio.
check(
  'clear vuelve al inicio, no al vacío',
  /function reiniciar/.test(tsScript) && !/scroll\.replaceChildren/.test(tsScript),
  'los nombres locales no sobreviven al minificado: se comprueba en el fuente',
);

// Una sección de tipo página no es una lista: su contenido lo arma el servidor.
// Renderizarla en el cliente deja un prompt donde no pasó nada.
check(
  'solo las colecciones se listan en el cliente',
  /tipo !== 'coleccion'/.test(tsScript) && /coleccion/.test(js),
  'una sección de tipo página tiene que navegarse de verdad',
);

console.log('\nBlindaje');
// Cloudflare Pages sirve las cabeceras desde este archivo. Si no viaja dentro
// de dist/, el sitio se despliega sin ninguna protección y responde igual.
const headersPath = join(DIST, '_headers');
check('_headers desplegado', existsSync(headersPath), 'sin él Cloudflare no aplica ninguna cabecera');
const headers = existsSync(headersPath) ? readFileSync(headersPath, 'utf8') : '';
for (const h of [
  'Content-Security-Policy',
  'Strict-Transport-Security',
  'X-Content-Type-Options',
  'X-Frame-Options',
  'Referrer-Policy',
  'Permissions-Policy',
]) {
  check('cabecera ' + h, new RegExp('^\\s*' + h + ':', 'm').test(headers));
}

// Una sola concesión de más vuelve la CSP decorativa, y el navegador no se
// queja: sigue cargando todo igual.
const scriptSrc = (headers.match(/script-src[^;]*/) || [''])[0];
for (const flojo of ["'unsafe-inline'", "'unsafe-eval'", '*']) {
  check('script-src sin ' + flojo, scriptSrc !== '' && !scriptSrc.includes(flojo));
}

// El visor incrusta un PDF del propio origen con <object>: sin object-src la
// CSP hereda default-src 'none' y el navegador lo bloquea en silencio, con el
// panel abriéndose vacío. Se concede solo 'self' — nada de blob:, data: ni un
// origen ajeno — para no abrir más de lo que este archivo necesita.
const objectSrc = (headers.match(/object-src[^;]*/) || [''])[0];
check(
  "CSP del sitio: object-src 'self' (y nada más ancho)",
  objectSrc.trim() === "object-src 'self'",
  objectSrc || '(sin object-src: el <object> del visor se bloquearía)',
);

// object-src no alcanza: Chromium pinta el PDF incrustado dentro de un marco
// propio, así que la política también tiene que permitir enmarcar el propio
// origen. En producción, sin esto, el visor caía a su enlace de emergencia con
// «El navegador no pudo mostrar el PDF» — y no se veía en local, porque astro
// preview no aplica public/_headers. Esta comprobación existe por ese fallo.
const frameSrc = (headers.match(/frame-src[^;]*/) || [''])[0];
check(
  "CSP del sitio: frame-src 'self' (el PDF incrustado se pinta en un marco)",
  frameSrc.trim() === "frame-src 'self'",
  frameSrc || '(sin frame-src: el PDF del visor queda bloqueado en producción)',
);

// Un script en línea obligaría a aflojar la CSP. define:vars lo produce sin
// avisar y la página se ve idéntica, hasta que en producción queda bloqueado.
const inline = (html.match(/<script(?![^>]*\ssrc=)[^>]*>/g) || []).filter(
  (t) => !/type="application\/(ld\+json|json)"/.test(t),
);
check('sin scripts en línea', inline.length === 0, inline.join(' '));
check('sin estilos en línea', !/<style[\s>]/.test(html));
// Un atributo style= también lo bloquea style-src, y no deja rastro visible:
// el estilo simplemente no se aplica. Es más fácil de colar que un <style>.
const atributos = html.match(/\sstyle="[^"]*"/g) || [];
check('sin atributos style=', atributos.length === 0, atributos.join(' '));

// La comprobación de arriba solo mira index.html. El mapa de calor del stack
// pinta sus niveles con clases (.nivel-1…5) precisamente porque un atributo
// style= también lo bloquea style-src y no deja rastro visible: el barrido
// tiene que cubrir todas las páginas del sitio, no solo la de inicio.
const atributosStyleSitio = [];
for (const archivo of paginasHtml) {
  const encontrados = readFileSync(archivo, 'utf8').match(/\sstyle="[^"]*"/g) || [];
  if (encontrados.length > 0) atributosStyleSitio.push(`${relative(DIST, archivo).replace(/\\/g, '/')}: ${encontrados.length}`);
}
check(
  'sin atributos style= en ninguna página del sitio',
  atributosStyleSitio.length === 0,
  atributosStyleSitio.join(' · '),
);
check('script servido como archivo', /<script[^>]+src="\/_astro\/[^"]+\.js"/.test(html));

// La versión exacta del framework es una pista gratis para quien busca un CVE.
check('sin meta generator', !/name="generator"/.test(html));

console.log('\nPerfil editable (CMS)');
// El perfil deja de ser un literal en TypeScript y pasa a vivir en
// src/content/perfil.yaml: un CMS basado en Git (Sveltia, en una PR futura)
// puede editar YAML pero no TypeScript. Los cálculos que sí son código — el
// teléfono legible, los enlaces de contacto — se quedan en src/data/perfil.ts,
// pero el dato en sí no puede seguir ahí, o el CMS no tendría nada que editar.
const perfilYamlPath = 'src/content/perfil.yaml';
const perfilYamlExiste = existsSync(perfilYamlPath);
check('src/content/perfil.yaml existe', perfilYamlExiste);
const perfilYaml = perfilYamlExiste ? readFileSync(perfilYamlPath, 'utf8') : '';
check('el YAML declara la entrada "perfil"', /^perfil:/m.test(perfilYaml));

// Se lee con una expresión regular y no con un parser de YAML: el archivo es
// plano (una sola entrada, campos escalares) y así la comprobación no suma una
// dependencia solo para leer cinco líneas.
function leerCampoYaml(campo) {
  const m = perfilYaml.match(new RegExp(`^\\s*${campo}:\\s*['"]?([^'"\\n]+?)['"]?\\s*$`, 'm'));
  return m ? m[1].trim() : '';
}
const correoYaml = leerCampoYaml('correo');
const telefonoYaml = leerCampoYaml('telefono');
const githubYaml = leerCampoYaml('github');
const linkedinYaml = leerCampoYaml('linkedin');
const orcidYaml = leerCampoYaml('orcid');
check(
  'el YAML trae correo, teléfono, github, linkedin y orcid',
  [correoYaml, telefonoYaml, githubYaml, linkedinYaml, orcidYaml].every((v) => v.length > 0),
);

const perfilTsPath = 'src/data/perfil.ts';
const perfilTsExiste = existsSync(perfilTsPath);
const perfilTs = perfilTsExiste ? readFileSync(perfilTsPath, 'utf8') : '';

// Cada comprobación exige que el YAML ya tenga el dato (si no lo tiene, no hay
// nada que comparar y la migración no terminó) y que ese mismo valor no
// aparezca también escrito en el código.
const sinLiteral = (valor) => perfilYamlExiste && valor.length > 0 && (!perfilTsExiste || !perfilTs.includes(valor));
check('src/data/perfil.ts no repite el correo del perfil', sinLiteral(correoYaml));
check('src/data/perfil.ts no repite el teléfono del perfil', sinLiteral(telefonoYaml));
check('src/data/perfil.ts no repite el usuario de GitHub del perfil', sinLiteral(githubYaml));
check('src/data/perfil.ts no repite el usuario de LinkedIn del perfil', sinLiteral(linkedinYaml));
check('src/data/perfil.ts no repite el ORCID del perfil', sinLiteral(orcidYaml));

console.log('\nPanel de administración (CMS)');
// Sveltia CMS vive en public/admin/ y se sirve tal cual desde dist/admin/: es
// HTML y YAML estáticos, sin paso de compilación propio. Estas comprobaciones
// se escribieron antes de crear los archivos (TDD): corridas contra un dist/
// sin /admin/ fallaban todas, y solo entonces se implementó el panel.
const adminHtmlPath = join(DIST, 'admin', 'index.html');
const adminHtmlExiste = existsSync(adminHtmlPath);
check('dist/admin/index.html existe', adminHtmlExiste);
const adminHtml = adminHtmlExiste ? readFileSync(adminHtmlPath, 'utf8') : '';
check('el panel pide noindex', /<meta\s+name="robots"\s+content="noindex"/.test(adminHtml));

// Mismo criterio que «Blindaje» más arriba, aplicado a esta página aparte: un
// script en línea sin src, o cualquier estilo en línea, rompería la CSP
// propia del panel (script-src/style-src sin 'unsafe-inline' para script).
const adminInlineScripts = (adminHtml.match(/<script(?![^>]*\ssrc=)[^>]*>/g) || []).filter(
  (t) => !/type="application\/(ld\+json|json)"/.test(t),
);
check(
  'el panel no lleva scripts en línea',
  adminHtmlExiste && adminInlineScripts.length === 0,
  adminInlineScripts.join(' '),
);
check('el panel no lleva <style>', adminHtmlExiste && !/<style[\s>]/.test(adminHtml));
const adminAtributosStyle = adminHtml.match(/\sstyle="[^"]*"/g) || [];
check(
  'el panel no lleva atributos style=',
  adminHtmlExiste && adminAtributosStyle.length === 0,
  adminAtributosStyle.join(' '),
);

// El bundle de Sveltia lo copia scripts/copiar-admin.mjs antes del build
// (hook prebuild/predev): si ese paso no corrió, el <script src="..."> del
// panel apunta a un archivo que no existe en dist/.
const adminBundleSrc = (adminHtml.match(/<script\s+src="([^"]+)"/) || [])[1] || '';
check(
  'el panel referencia un bundle propio, no unpkg ni ningún otro CDN',
  adminBundleSrc.startsWith('/admin/'),
  adminBundleSrc || '(sin script)',
);
check(
  'el bundle referenciado existe en dist/',
  adminBundleSrc !== '' && existsSync(join(DIST, adminBundleSrc.replace(/^\//, ''))),
  adminBundleSrc,
);

const adminConfigPath = join(DIST, 'admin', 'config.yml');
const adminConfigExiste = existsSync(adminConfigPath);
check('dist/admin/config.yml existe', adminConfigExiste);
const cmsConfig = adminConfigExiste ? parseYaml(readFileSync(adminConfigPath, 'utf8')) : {};

check('el backend del CMS es github', cmsConfig.backend?.name === 'github');
// El nombre del repositorio ("jbmll-web") es infraestructura fija, no lo edita
// el CMS: se deja literal. El usuario sí es un dato del perfil y se deriva.
const repoEsperado = `${githubEsperado}/jbmll-web`;
check(
  `el repositorio es ${repoEsperado || '(perfil.yaml sin github)'}`,
  githubEsperado.length > 0 && cmsConfig.backend?.repo === repoEsperado,
  cmsConfig.backend?.repo ?? '(sin repo)',
);
check('la rama es main', cmsConfig.backend?.branch === 'main');
check(
  'solo se permite iniciar sesión con token (sin worker de OAuth)',
  Array.isArray(cmsConfig.backend?.auth_methods) &&
    cmsConfig.backend.auth_methods.length === 1 &&
    cmsConfig.backend.auth_methods[0] === 'token',
);

// --- Cada colección de content.config.ts tiene su espejo en el CMS --------
// No hay forma de importar Zod desde un script plano de Node para leer los
// esquemas de verdad, así que esto lee el FUENTE de content.config.ts con
// expresiones regulares: busca el bloque `schema: z.object({ ... })` de cada
// colección (contando llaves, para no cortarlo a mitad — una `{` de un
// cuantificador de regex como `{4}` siempre trae su `}` en la misma línea, así
// que el conteo total no se desalinea) y de ahí extrae los nombres de campo de
// nivel superior. Funciona porque en este archivo cada campo de cada esquema
// se escribe en su propia línea indentada exactamente 4 espacios —
// `    <nombre>: z.algo(...)` o `    <nombre>: mes` (el validador de mes
// compartido no empieza con `z.`, así que la búsqueda se ata a la columna, no
// al prefijo) — y ninguno de los siete esquemas anida un z.object() dentro de
// otro: si eso cambiara, esta comprobación tendría que cambiar con ello. Es
// una lectura posicional del código fuente, no un analizador real de
// TypeScript/Zod.
const configTs = readFileSync('src/content.config.ts', 'utf8');

function nombresDeEsquema(nombreConst) {
  const inicioConst = configTs.search(new RegExp(`const ${nombreConst} = defineCollection\\(`));
  if (inicioConst === -1) return null;
  const marcaSchema = 'schema: z.object({';
  const idx = configTs.indexOf(marcaSchema, inicioConst);
  if (idx === -1) return null;
  const inicioLlave = idx + marcaSchema.length - 1;
  let profundidad = 0;
  let fin = -1;
  for (let i = inicioLlave; i < configTs.length; i++) {
    if (configTs[i] === '{') profundidad++;
    else if (configTs[i] === '}') {
      profundidad--;
      if (profundidad === 0) {
        fin = i;
        break;
      }
    }
  }
  if (fin === -1) return null;
  const bloque = configTs.slice(inicioLlave, fin + 1);
  return [...bloque.matchAll(/^ {4}(\w+):/gm)].map((m) => m[1]);
}

// Nombre de constante en content.config.ts → cómo llegar hasta el arreglo de
// nombres de campo del CMS que hay que comparar contra ese esquema. Tres
// colecciones necesitan «desenvolver» un nivel antes de comparar: ver los
// comentarios de cada una.
const COLECCIONES_CMS = [
  { astro: 'experiencia', campos: () => cmsConfig.collections?.find((c) => c.name === 'experiencia')?.fields?.map((f) => f.name) },
  { astro: 'proyectos', campos: () => cmsConfig.collections?.find((c) => c.name === 'proyectos')?.fields?.map((f) => f.name) },
  { astro: 'publicaciones', campos: () => cmsConfig.collections?.find((c) => c.name === 'publicaciones')?.fields?.map((f) => f.name) },
  { astro: 'educacion', campos: () => cmsConfig.collections?.find((c) => c.name === 'educacion')?.fields?.map((f) => f.name) },
  {
    // Colección de archivos: sus dos entradas comparten el mismo conjunto de
    // campos de frontmatter. "body" es el contenido Markdown fuera del
    // frontmatter — no es una clave del esquema de Zod — así que se excluye a
    // propósito de la comparación.
    astro: 'paginas',
    campos: () => {
      const archivos = cmsConfig.collections?.find((c) => c.name === 'paginas')?.files || [];
      const conjuntos = archivos.map((a) => (a.fields || []).map((f) => f.name).filter((n) => n !== 'body'));
      if (conjuntos.length === 0) return null;
      const mismos = conjuntos.every(
        (c) => JSON.stringify([...c].sort()) === JSON.stringify([...conjuntos[0]].sort()),
      );
      return mismos ? conjuntos[0] : ['(los archivos de "paginas" no comparten los mismos campos)'];
    },
  },
  {
    // El archivo es un arreglo YAML en la raíz, sin clave que lo envuelva: los
    // campos que hay que comparar son los del campo `list` con `root: true`,
    // no el nombre de ese campo.
    astro: 'certificaciones',
    campos: () => {
      const archivo = cmsConfig.collections?.find((c) => c.name === 'certificaciones')?.files?.[0];
      const listaRaiz = archivo?.fields?.find((f) => f.widget === 'list' && f.root === true);
      return listaRaiz?.fields?.map((f) => f.name);
    },
  },
  {
    // perfil.yaml envuelve sus campos en una sola clave de nivel superior
    // ("perfil:"), reproducida con un campo widget:object del mismo nombre:
    // los campos que hay que comparar son sus subcampos, no "perfil" mismo.
    astro: 'perfil',
    campos: () => {
      const singleton = cmsConfig.singletons?.find((s) => s.name === 'perfil');
      const objeto = singleton?.fields?.find((f) => f.name === 'perfil' && f.widget === 'object');
      return objeto?.fields?.map((f) => f.name);
    },
  },
];

// export const collections = { paginas, experiencia, ... }; — la lista real de
// colecciones que Astro compila, para no dar por hecho a mano cuáles son
// «todas».
const exportBloque = (configTs.match(/export const collections = \{([\s\S]*?)\};/) || [])[1] || '';
const coleccionesAstro = [...exportBloque.matchAll(/(\w+)/g)].map((m) => m[1]);

const sinEspejo = coleccionesAstro.filter((c) => !COLECCIONES_CMS.some((m) => m.astro === c));
check('toda colección de content.config.ts tiene su espejo en el CMS', sinEspejo.length === 0, sinEspejo.join(', '));

for (const { astro, campos } of COLECCIONES_CMS) {
  const esperados = nombresDeEsquema(astro);
  const reales = adminConfigExiste ? campos() : null;
  const ok =
    Array.isArray(esperados) &&
    Array.isArray(reales) &&
    JSON.stringify([...esperados].sort()) === JSON.stringify([...reales].sort());
  check(
    `"${astro}": los campos del CMS son los mismos que los del esquema`,
    ok,
    `esquema: ${(esperados || []).join(', ') || '¿?'} · cms: ${(reales || []).join(', ') || '¿?'}`,
  );
}

console.log('\nPanel de administración: cabeceras');
const headersSrc = readFileSync('public/_headers', 'utf8');
const bloqueAdmin = (headersSrc.match(/\n\/admin\/\*\n([\s\S]*?)(?=\n\/\S|\n*$)/) || [])[1] || '';
check('_headers trae un bloque /admin/*', bloqueAdmin !== '');
check('el bloque /admin/* desprende la CSP heredada', /^\s*!\s*Content-Security-Policy\s*$/m.test(bloqueAdmin));
const cspAdmin = (bloqueAdmin.match(/^\s*Content-Security-Policy:\s*(.+)$/m) || [])[1] || '';
check(
  'la CSP del panel declara connect-src con la API de GitHub',
  /connect-src[^;]*\bhttps:\/\/api\.github\.com\b/.test(cspAdmin),
  cspAdmin || '(sin CSP propia)',
);
// La intención de esta comprobación es que el bundle del panel venga del
// propio origen y no de un CDN, y eso lo decide script-src, no la CSP entera:
// unpkg sí está permitido en connect-src, donde Sveltia consulta su versión
// publicada (ver el comentario de public/_headers). Mirar la CSP completa
// confundía las dos cosas y daba rojo por un permiso que sí queremos.
const scriptSrcAdmin = (cspAdmin.match(/script-src([^;]*)/) || [])[1] || '';
check(
  'el panel no carga su bundle de un CDN: script-src solo permite el propio origen',
  scriptSrcAdmin.trim() === "'self'",
  scriptSrcAdmin.trim() || '(sin script-src)',
);
check('_headers también cubre /admin, sin barra ni comodín', /\n\/admin\n/.test(headersSrc));

const bloqueSitio = (headersSrc.match(/\n\/\*\n([\s\S]*?)(?=\n\/\S|\n*$)/) || [])[1] || '';
const cspSitio = (bloqueSitio.match(/^\s*Content-Security-Policy:\s*(.+)$/m) || [])[1] || '';
check(
  'la CSP del resto del sitio sigue con script-src \'self\' y sin unsafe-inline',
  /script-src[^;]*'self'/.test(cspSitio) && !/script-src[^;]*unsafe-inline/.test(cspSitio),
  cspSitio || '(sin CSP)',
);

console.log('\nPanel de administración: rastreo e indexación');
const robotsTxt = readFileSync('public/robots.txt', 'utf8');
check('robots.txt no permite rastrear /admin/', /^Disallow:\s*\/admin\/\s*$/m.test(robotsTxt));
check('el panel no aparece en el sitemap generado', !sitemap.includes('/admin'));

console.log('\nVisor de certificados');
// El marcado del panel flotante vive una sola vez en src/components/Visor.astro
// —vacío y cerrado por defecto—, incluido en /sobre-mi junto a la tabla que lo
// abre; scripts/visor.ts lo llena al vuelo con el archivo de la certificación
// que se pulsó. Estas comprobaciones se escribieron en rojo antes de crear
// Visor.astro y el campo `archivo` (TDD): sin ellos, todo lo de abajo fallaba.
// Ninguna nombra una certificación concreta: todo se deriva de
// src/content/certificaciones.yaml, igual que el resto del archivo.

const dialogs = [...sobreMi.matchAll(/<dialog\b[^>]*>/g)].map((m) => m[0]);
check('/sobre-mi renderiza exactamente un <dialog>', dialogs.length === 1, `${dialogs.length} encontrados`);
const dialogTag = dialogs[0] || '';
check(
  'el <dialog> no trae el atributo open: cerrado por defecto',
  dialogs.length === 1 && !/\sopen(?=[\s=>])/.test(dialogTag),
  dialogTag,
);

const labelledbyId = (dialogTag.match(/aria-labelledby="([^"]+)"/) || [])[1] || '';
check(
  'el <dialog> declara un nombre accesible (aria-labelledby) que apunta a un elemento que existe',
  labelledbyId !== '' && new RegExp(`id="${labelledbyId}"`).test(sobreMi),
  labelledbyId || '(sin aria-labelledby)',
);

const bloqueVisor = (sobreMi.match(/<dialog\b[^>]*>[\s\S]*?<\/dialog>/) || [''])[0];
const botonesVisor = bloqueVisor.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) || [];
check(
  'el visor trae exactamente un botón de cerrar, con nombre accesible propio',
  botonesVisor.length === 1 && /aria-label="[^"]+"/.test(botonesVisor[0] || ''),
  botonesVisor.join(' · '),
);
check('el visor ofrece la pista de cerrar con Esc', /Esc/.test(bloqueVisor), bloqueVisor);

// El esquema (content.config.ts) es la fuente de verdad de qué certificación
// trae `archivo`, `url` o `credencial`.
const certificacionesSrc = parseYaml(readFileSync('src/content/certificaciones.yaml', 'utf8')) ?? [];
const conArchivo = certificacionesSrc.filter((c) => c.archivo);
const conUrl = certificacionesSrc.filter((c) => c.url);
const conCredencial = certificacionesSrc.filter((c) => c.credencial);

// Mismo criterio que rutaMedia() en src/lib/render.ts: una ruta ya codificada
// (con un '%XX') se deja tal cual, para no codificarla dos veces.
const rutaMedia = (ruta) => (/%[0-9a-fA-F]{2}/.test(ruta) ? ruta : encodeURI(ruta));
const escRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const anchorsSobreMi = [...sobreMi.matchAll(/<a\b[^>]*>[^<]*<\/a>/g)].map((m) => m[0]);
const anchorParaHref = (href) => anchorsSobreMi.find((a) => a.includes(`href="${href}"`));

const versRenderizados = anchorsSobreMi.filter((a) => /class="[^"]*\bvisor-abrir\b[^"]*"/.test(a));
if (conArchivo.length === 0) {
  skip('cada certificación con archivo (y solo esas) renderiza su enlace [ver]', 'ninguna certificación trae archivo en este build');
  skip('el enlace [ver] incluye el nombre de la certificación en su nombre accesible', 'ninguna certificación trae archivo en este build');
} else {
  check(
    'cada certificación con archivo (y solo esas) renderiza su enlace [ver]',
    versRenderizados.length === conArchivo.length,
    `${versRenderizados.length} enlaces [ver] · ${conArchivo.length} certificaciones con archivo`,
  );
  const verMal = conArchivo.filter((c) => {
    const a = anchorParaHref(rutaMedia(c.archivo));
    return !a || !new RegExp(`aria-label="[^"]*${escRegex(c.nombre)}[^"]*"`).test(a) || !/class="[^"]*\bvisor-abrir\b[^"]*"/.test(a);
  });
  check(
    'el enlace [ver] de cada certificación con archivo apunta a su ruta (codificada) y su nombre accesible incluye el nombre de la certificación',
    verMal.length === 0,
    verMal.map((c) => c.id).join(', '),
  );
}

if (conUrl.length === 0) {
  skip('cada certificación con url (y solo esas) renderiza su enlace [verificar]', 'ninguna certificación trae url en este build');
} else {
  const verificarRenderizados = conUrl.filter((c) => {
    const a = anchorParaHref(c.url);
    return a && new RegExp(`aria-label="[^"]*${escRegex(c.nombre)}[^"]*"`).test(a);
  });
  check(
    'el enlace [verificar] de cada certificación con url apunta a esa url y su nombre accesible incluye el nombre de la certificación',
    verificarRenderizados.length === conUrl.length,
    `${verificarRenderizados.length} de ${conUrl.length}`,
  );
}

const credSpans = [...sobreMi.matchAll(/<span class="cred"[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]);
if (conCredencial.length === 0) {
  skip('cada certificación con credencial (y solo esas) la muestra', 'ninguna certificación trae credencial en este build');
} else {
  check(
    'cada certificación con credencial (y solo esas) la muestra, discreta',
    credSpans.length === conCredencial.length && conCredencial.every((c) => credSpans.includes(c.credencial)),
    `mostradas: ${credSpans.join(', ') || '—'} · esperadas: ${conCredencial.map((c) => c.credencial).join(', ')}`,
  );
}

// Comprobación estructural por expresión regular sobre el propio código del
// script: no sustituye una prueba real de teclado/lector de pantalla en el
// navegador. Solo evita la regresión de reimplementar a mano lo que
// showModal() ya resuelve — el pedido explícito de esta funcionalidad.
const visorTsPath = 'src/scripts/visor.ts';
const visorTsExiste = existsSync(visorTsPath);
check('visor.ts existe como módulo aparte, para que tsc lo revise', visorTsExiste);
const visorTs = visorTsExiste ? readFileSync(visorTsPath, 'utf8') : '';
check('visor.ts abre el panel con showModal()', /\.showModal\(\)/.test(visorTs));
check(
  'visor.ts no maneja "Escape" a mano (lo resuelve el <dialog> nativo)',
  !/Escape/.test(visorTs),
);
check(
  'visor.ts no implementa su propio atrapado de foco (ninguna referencia a "Tab": responsabilidad de showModal())',
  !/\bTab\b/.test(visorTs),
);
check(
  'Visor.astro carga visor.ts como los demás scripts del sitio (sin lógica suelta en el componente)',
  existsSync('src/components/Visor.astro') &&
    readFileSync('src/components/Visor.astro', 'utf8').includes("import '../scripts/visor'"),
);
check(
  '/sobre-mi incluye el componente Visor',
  existsSync('src/pages/sobre-mi.astro') && readFileSync('src/pages/sobre-mi.astro', 'utf8').includes('<Visor'),
);

console.log('\nRutas de medios (/media/)');
// Toda ruta /media/ que llega al HTML tiene que poder decodificarse a un
// archivo real dentro de dist/: un espacio sin codificar en el nombre de un
// archivo subido por el CMS rompe la petición (corta la URL en el espacio), y
// una ruta que no resuelve a ningún archivo da un 404 en silencio — ninguno
// de los dos deja rastro visible sin esta comprobación.
const rutasMedia = new Set();
for (const archivo of paginasHtml) {
  const contenido = readFileSync(archivo, 'utf8');
  for (const m of contenido.matchAll(/(?:href|src|data)="(\/media\/[^"]*)"/g)) rutasMedia.add(m[1]);
}
const mediaConEspacio = [...rutasMedia].filter((r) => /\s/.test(r));
check(
  'ninguna ruta /media/ del HTML lleva un espacio sin codificar',
  mediaConEspacio.length === 0,
  mediaConEspacio.join(', '),
);
const mediaFaltante = [];
for (const ruta of rutasMedia) {
  if (/\s/.test(ruta)) continue; // ya reportada arriba
  let decodificada;
  try {
    decodificada = decodeURI(ruta);
  } catch {
    mediaFaltante.push(`${ruta} (no se pudo decodificar)`);
    continue;
  }
  if (!existsSync(join(DIST, decodificada.replace(/^\//, '')))) mediaFaltante.push(ruta);
}
check(
  'toda ruta /media/ del HTML resuelve, ya decodificada, a un archivo dentro de dist/',
  rutasMedia.size > 0 && mediaFaltante.length === 0,
  rutasMedia.size === 0 ? 'no hay ninguna ruta /media/ en este build' : mediaFaltante.join(', '),
);

console.log('\nPeso');
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const htmlSize = Buffer.byteLength(html);
console.log('  html  ' + kb(htmlSize));
console.log('  css   ' + kb(Buffer.byteLength(css)));
const pesoFuentes = readdirSync(join(DIST, 'fonts'))
  .filter((f) => f.endsWith('.woff2'))
  .reduce((n, f) => n + statSync(join(DIST, 'fonts', f)).size, 0);
console.log('  fuentes ' + kb(pesoFuentes));
check('las fuentes por debajo de 80 KB', pesoFuentes < 80 * 1024, kb(pesoFuentes));
check('html por debajo de 50 KB', htmlSize < 50 * 1024, kb(htmlSize));

console.log(fails ? '\n' + fails + ' FALLAS\n' : '\ntodo verde\n');
process.exit(fails ? 1 : 0);
