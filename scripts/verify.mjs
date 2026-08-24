/* Verifica el sitio compilado. Cada comprobación existe por un fallo real, y
 * todos fallaban en silencio. El detalle, en el README. */
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
  console.error('No hay dist/. Ejecute `npm run build` primero.');
  process.exit(1);
}

const html = readFileSync(join(DIST, 'index.html'), 'utf8');

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
check('h1 con el nombre completo', h1limpio.includes('Josue Bladimir Morales Llanganate'), h1limpio);
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
check('usuario de GitHub correcto', handles.has('MrT-coder'), [...handles].join(', '));

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
const SECCIONES = ['sobre-mi', 'proyectos', 'publicaciones', 'contacto'];
for (const sec of SECCIONES) {
  check(`/${sec} generada`, existsSync(join(DIST, `${sec}.html`)));
}

// Sin JavaScript la página tiene que traer su contenido. Es la diferencia entre
// una página que un buscador lee y una que ve vacía.
const proyectos = leer('proyectos.html');
check(
  '/proyectos trae su contenido sin JavaScript',
  proyectos.includes('estudio jurídico') && proyectos.includes('panel'),
);
const sobreMi = leer('sobre-mi.html');
check(
  '/sobre-mi trae experiencia y stack sin JavaScript',
  sobreMi.includes('FirmaSeguraEc') && sobreMi.includes('Spring Boot'),
);

// Una publicación sin cuerpo propio no genera página. Si la generara, sería un
// título repetido compitiendo con el original del editor.
const sitemap = leer('sitemap-0.xml');
const publicaciones = leer('publicaciones.html');
check(
  'la publicación sin cuerpo no tiene página',
  !existsSync(join(DIST, 'publicaciones', 'xr-salento-2026-tea.html')),
);
check('esa publicación tampoco está en el sitemap', !sitemap.includes('xr-salento'));
check('pero sí aparece en su índice, con su DOI', publicaciones.includes('doi.org'));

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

console.log('\nPeso');
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const htmlSize = Buffer.byteLength(html);
console.log('  html  ' + kb(htmlSize));
console.log('  css   ' + kb(Buffer.byteLength(css)));
console.log('  fuentes ' + kb(41516));
check('html por debajo de 50 KB', htmlSize < 50 * 1024, kb(htmlSize));

console.log(fails ? '\n' + fails + ' FALLAS\n' : '\ntodo verde\n');
process.exit(fails ? 1 : 0);
