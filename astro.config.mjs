// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  // El dominio real. Astro lo usa para generar URLs absolutas en el sitemap y
  // en las etiquetas canónicas, así que tiene que ser el de producción aunque
  // todavía no apunte a ningún lado.
  site: 'https://jbmll.dev',

  // Estático puro. Todavía no hay adaptador de Cloudflare porque todavía no hay
  // nada que renderizar por petición: el adaptador entra cuando aparezca /admin,
  // no antes. Configurar hoy lo que no se puede probar hoy es adivinar.
  output: 'static',

  build: {
    // Genera /pagina.html en vez de /pagina/index.html. Sobre Cloudflare Pages
    // las dos formas sirven; esta deja el directorio de salida legible.
    format: 'file',
  },

  // Sin JavaScript de framework: la terminal es una isla propia con un script
  // suelto. Cada kilobyte que no mandamos es uno que el visitante no descarga.
});
