// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import rehypeFiguras from './src/lib/rehype-figuras.mjs';

export default defineConfig({
  site: 'https://jbmllnube.com',
  output: 'static',

  // Genera /pagina.html. Cloudflare Pages lo sirve en /pagina, sin extensión,
  // que es la forma de URL que usa la terminal para navegar.
  // inlineStylesheets nunca: 'auto' pone el CSS pequeño dentro de un <style>,
  // y eso exigiría 'unsafe-inline' en style-src.
  build: { format: 'file', inlineStylesheets: 'never' },

  integrations: [sitemap()],

  // Convierte cada imagen del cuerpo (proyectos, publicaciones) en una figura
  // con pie, y marca todo enlace a un PDF propio para el visor flotante. Ver
  // el encabezado de src/lib/rehype-figuras.mjs para el porqué completo.
  //
  // Astro 7 cambió el procesador de Markdown por defecto a Sätteri, que no
  // entiende `markdown.rehypePlugins` directo (el build falla explícitamente
  // pidiendo esto): hay que volver a pedir el procesador remark/rehype de
  // siempre con `processor: unified(...)`, que sí lo mantiene. De ahí la
  // única dependencia nueva de todo este cambio — no la lectura de
  // dimensiones de imagen, que sigue sin ninguna (ver rehype-figuras.mjs).
  markdown: { processor: unified({ rehypePlugins: [rehypeFiguras] }) },

  // Astro pone en línea los scripts pequeños. Un script en línea obliga a
  // aflojar la CSP con 'unsafe-inline', así que se fuerza el archivo aparte.
  vite: { build: { assetsInlineLimit: 0 } },

  // Sin @astrojs/cloudflare todavía: el adaptador sirve para renderizar por
  // petición y aún no hay ninguna ruta que lo necesite. Entra con /admin.
});
