/* Verifica el sitio ya compilado, no el código fuente.
 *
 * Cada comprobación está acá porque algo falló de verdad durante el prototipo,
 * y todas fallan en silencio: la página se ve "casi bien" y nadie lo nota hasta
 * que alguien la abre en un teléfono o un buscador la indexa mal.
 *
 * Uso:  node scripts/verify.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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

if (!existsSync(DIST)) {
  console.error('No hay dist/. Corré `npm run build` primero.');
  process.exit(1);
}

const html = readFileSync(join(DIST, 'index.html'), 'utf8');

console.log('\nDocumento');
// Faltó durante el prototipo: sin viewport, un navegador móvil finge 980px de
// ancho, encoge todo y ninguna media query ve la pantalla real.
check('doctype', html.trimStart().toLowerCase().startsWith('<!doctype html>'));
check('lang declarado', /<html[^>]+lang="es"/.test(html));
check('charset utf-8', /<meta\s+charset="utf-8"/i.test(html));
check('viewport', /name="viewport"[^>]*width=device-width/.test(html));
check('title no vacío', /<title>[^<]{10,}<\/title>/.test(html));
check('description', /name="description"[^>]*content="[^"]{40,}"/.test(html));
check('canonical absoluta', /rel="canonical"[^>]*href="https:\/\//.test(html));
check('open graph', /property="og:title"/.test(html));
check('autor', /name="author"/.test(html));

// Un solo h1 por página, y con el nombre completo separado: Astro recorta el
// espacio al final de línea y "de" + <strong>Josue</strong> queda "deJosue".
const h1s = html.match(/<h1[\s\S]*?<\/h1>/g) || [];
check('exactamente un h1', h1s.length === 1, h1s.length + ' encontrados');
const h1txt = (h1s[0] || '').replace(/<[^>]+>/g, '');
// Astro recorta el espacio al final de línea en las plantillas: `de` + salto +
// `<strong>` renderiza "deJosue", y `</strong>` + salto + `(` da "Llanganate(".
// Se lee bien en el código y se ve mal en pantalla, así que se comprueba acá.
check(
  'h1 con el nombre completo y bien separado',
  /oficial de Josue Bladimir Morales Llanganate \(JBMLL\)/.test(h1txt.replace(/\s+/g, ' ')),
  h1txt.replace(/\s+/g, ' ').trim(),
);
check('theme-color', /name="theme-color"/.test(html));

console.log('\nTipografía');
// El glifo del prompt vive en el Área de Uso Privado: sin la fuente empaquetada
// es un cuadrado vacío en toda máquina que no tenga una Nerd Font instalada.
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
// Los espacios al final de línea son parte del dibujo y cualquier editor con
// "trim trailing whitespace" los borra: el banner queda escalonado.
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
// CSS no avisa de una variable inexistente: hereda en silencio y el color queda
// mal sin que nada se rompa. Así estuvo roto `--peach` durante días.
const usadas = new Set([...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
const definidas = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
const fantasma = [...usadas].filter((v) => !definidas.has(v));
check('sin variables fantasma', fantasma.length === 0, fantasma.join(', '));

console.log('\nAlcance del CSS');
// Los estilos de un .astro tienen alcance de componente: Astro marca los
// elementos de la PLANTILLA y limita el CSS a esa marca. Los elementos que crea
// el script en tiempo de ejecución nunca reciben la marca, así que esas reglas
// no los alcanzan jamás. El síntoma es traicionero: la página se ve casi bien
// —la pista táctil aparece en escritorio, el cursor no parpadea— y nada avisa.
const RUNTIME = ['tap-hint', 'caret', 'brain', 'inputline', 'typed', 'entry', 'out'];
for (const cls of RUNTIME) {
  const suelta = new RegExp('\\.' + cls + '(?![\\w-])(?!\\[data-astro-cid)');
  check(
    'sin alcance: .' + cls,
    suelta.test(css),
    'solo existe con alcance de componente; el script crea ese elemento y no lo recibe',
  );
}

console.log('\nPeso');
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const htmlSize = Buffer.byteLength(html);
console.log('  html  ' + kb(htmlSize));
console.log('  css   ' + kb(Buffer.byteLength(css)));
console.log('  fuentes ' + kb(41516));
check('html por debajo de 50 KB', htmlSize < 50 * 1024, kb(htmlSize));

console.log(fails ? '\n' + fails + ' FALLAS\n' : '\ntodo verde\n');
process.exit(fails ? 1 : 0);
