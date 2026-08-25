import type { APIRoute } from 'astro';
import { getIndice } from '../lib/content';

// Lo que la terminal necesita para navegar sin recargar: secciones, entradas y
// stack, en la misma forma plana que consume el renderizador.
//
// Se pide con fetch en vez de incrustarlo en cada página: son los mismos datos
// para todas, y así se descarga una vez y el navegador lo cachea. `connect-src
// 'self'` ya lo permite, sin tocar la política de seguridad.
export const GET: APIRoute = async () => {
  const indice = await getIndice();
  return new Response(JSON.stringify(indice), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
