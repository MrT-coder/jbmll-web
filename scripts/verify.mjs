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
check('banner en el HTML', html.includes('█'));

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

// La barra de uso se dibuja pegando glifos █: el letter-spacing negativo es un
// truco de empaquetado de caracteres, no una decisión sobre texto legible.
const GLIFO_EXCEPCIONES = [/^\.stack td\.bar$/];

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
    const destino =
      sinAncla === '/'
        ? 'index.html'
        : extname(sinAncla)
          ? sinAncla.slice(1)
          : sinAncla.slice(1) + '.html';
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

// La barra mide usos contados. Un porcentaje de dominio no sale de ningún dato:
// lo pone quien escribe y nadie puede comprobarlo.
const barras = [...sm.matchAll(/<td class="bar"[^>]*title="(\d+) usos?"[^>]*>(█+)</g)].map(
  (m) => ({ usos: Number(m[1]), largo: m[2].length }),
);
check('el stack se dibuja con barras', barras.length > 0, `${barras.length} filas`);
check(
  'la barra es proporcional a los usos contados',
  barras.length > 0 &&
    barras.every((b) => b.largo >= 1) &&
    new Set(barras.map((b) => `${b.usos}:${b.largo}`)).size ===
      new Set(barras.map((b) => b.usos)).size,
  'a igual número de usos, igual largo de barra',
);
// Si alguna vez aparece un porcentaje, es que el número se inventó.
check('sin porcentajes de dominio', !/\b\d{1,3}\s*%/.test(sm), 'ese número no sale de ningún dato');

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
const INYECTADAS = ['panel', 'panel-t', 'panel-d', 'chips', 'chip', 'panels', 'row-go'];
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

check(
  'la marca JBMLL vuelve a estar en la barra lateral, enlazada al inicio',
  /<a class="sidebar-marca"[^>]*href="\/"[^>]*>JBMLL<\/a>/.test(html),
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
