import type { APIRoute } from 'astro';
import { getStack } from '../lib/content';

// El stack calculado, servido como dato. Lo consume el verificador hoy y la
// terminal en el cliente después: `connect-src 'self'` permite pedirlo sin
// tocar la política de seguridad.
export const GET: APIRoute = async () => {
  const stack = await getStack();
  return new Response(JSON.stringify(stack, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
