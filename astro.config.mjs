// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://jbmllnube.com',
  output: 'static',

  // Genera /pagina.html. Cloudflare Pages lo sirve en /pagina, sin extensión,
  // que es la forma de URL que usa la terminal para navegar.
  // inlineStylesheets nunca: 'auto' pone el CSS pequeño dentro de un <style>,
  // y eso exigiría 'unsafe-inline' en style-src.
  build: { format: 'file', inlineStylesheets: 'never' },

  integrations: [sitemap()],

  // Astro pone en línea los scripts pequeños. Un script en línea obliga a
  // aflojar la CSP con 'unsafe-inline', así que se fuerza el archivo aparte.
  vite: { build: { assetsInlineLimit: 0 } },

  // Sin @astrojs/cloudflare todavía: el adaptador sirve para renderizar por
  // petición y aún no hay ninguna ruta que lo necesite. Entra con /admin.
});
