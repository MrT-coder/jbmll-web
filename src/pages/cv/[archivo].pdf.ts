import type { APIRoute, GetStaticPaths } from 'astro';
import { IDIOMAS, getPerfil, type Idioma } from '../../lib/content';
import { armarCv } from '../../lib/cv';
import { renderizarCv } from '../../lib/cv-pdf';
import { nombreDeCv } from '../../lib/cv-nombre';

// El CV en PDF, uno por idioma, generado en el build desde las mismas
// colecciones que la web. Un PDF que se sube a mano se desactualiza el día que
// cambia el sitio; este se reconstruye con cada despliegue.
export const getStaticPaths = (async () => {
  const perfil = await getPerfil();
  return IDIOMAS.map((lang) => ({
    params: { archivo: nombreDeCv(perfil.nombre, lang) },
    props: { lang },
  }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const cv = await armarCv((props as { lang: Idioma }).lang);
  const pdf = await renderizarCv(cv);
  return new Response(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf' } });
};
