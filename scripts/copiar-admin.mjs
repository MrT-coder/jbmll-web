/* Sveltia CMS no se puede importar como módulo: solo distribuye un bundle ya
 * compilado (`dist/sveltia-cms.js` dentro del paquete, el mismo archivo que
 * unpkg sirve). Comprometerlo al repositorio significaría versionar código de
 * un tercero que ya vive versionado en package-lock.json, así que este script
 * lo copia a public/admin/ en cada build — el archivo copiado está en
 * .gitignore — y así /admin/ se sirve desde el propio origen del sitio, sin
 * depender de unpkg ni de ningún CDN externo (ver public/admin/index.html y
 * la CSP en public/_headers).
 *
 * Corre como hook `prebuild` (y `predev`, para que `astro dev` también sirva
 * el panel): npm ejecuta automáticamente `pre<nombre>` antes de `<nombre>`
 * cuando se invoca con `npm run <nombre>`. Por eso `ship` llama a
 * `npm run build` en vez de `astro build` directo — si no, este paso no
 * dispararía y el build local/CI y el de Cloudflare Pages (que sí corre
 * `npm run build`) podrían divergir.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
const origen = join(raiz, 'node_modules/@sveltia/cms/dist/sveltia-cms.js');
const destinoDir = join(raiz, 'public/admin');
const destino = join(destinoDir, 'sveltia-cms.js');

if (!existsSync(origen)) {
  console.error(
    'admin: no se encontró node_modules/@sveltia/cms/dist/sveltia-cms.js — ¿corrió `npm ci`/`npm install`?',
  );
  process.exit(1);
}

mkdirSync(destinoDir, { recursive: true });
copyFileSync(origen, destino);
console.log('admin: sveltia-cms.js copiado a public/admin/');
