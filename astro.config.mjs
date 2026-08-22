// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://jbmll.dev',
  output: 'static',
  build: { format: 'file' },

  // Sin @astrojs/cloudflare todavía: el adaptador sirve para renderizar por
  // petición y aún no hay ninguna ruta que lo necesite. Entra con /admin.
});
