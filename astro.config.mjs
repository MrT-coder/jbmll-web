// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://jbmllnube.com',
  output: 'static',

  // Genera /pagina.html. Cloudflare Pages lo sirve en /pagina, sin extensión,
  // que es la forma de URL que usa la terminal para navegar.
  build: { format: 'file' },

  integrations: [sitemap()],

  // Sin @astrojs/cloudflare todavía: el adaptador sirve para renderizar por
  // petición y aún no hay ninguna ruta que lo necesite. Entra con /admin.
});
