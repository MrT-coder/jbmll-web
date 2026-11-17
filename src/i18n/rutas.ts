import type { Idioma } from '../lib/content';

// Las URLs de cada idioma. El español vive en la raíz y el inglés bajo `/en/`;
// los slugs son los mismos en los dos (`/sobre-mi`, `/en/sobre-mi`): traducirlos
// duplicaría cada ruta que la terminal conoce y no aporta nada a quien lee.

/** El prefijo de cada idioma: vacío para el español. */
export const BASE_DE: Record<Idioma, string> = { es: '', en: '/en' };

/**
 * `rutaLocal('en', '/proyectos')` → `/en/proyectos`; `rutaLocal('en', '/')` →
 * `/en` (con format 'file' Astro emite la portada como en.html, que Cloudflare sirve en /en); `rutaLocal('es', '/proyectos')` → `/proyectos`. Acepta un `#ancla`.
 */
export function rutaLocal(lang: Idioma, ruta: string): string {
  if (lang === 'es') return ruta;
  return ruta === '/' ? '/en' : `/en${ruta}`;
}

/** Quita el `.html` y el `/index` con que sale el build, y la barra final. */
function limpia(pathname: string): string {
  const sin = pathname.replace(/\.html$/, '').replace(/\/index$/, '');
  return sin === '' ? '/' : sin.length > 1 ? sin.replace(/\/$/, '') : sin;
}

/** El idioma de una ruta, mirando solo el prefijo. */
export function idiomaDeRuta(pathname: string): Idioma {
  const p = limpia(pathname);
  return p === '/en' || p.startsWith('/en/') ? 'en' : 'es';
}

/** La misma página en el otro idioma. Los slugs son comunes: solo cambia el prefijo. */
export function rutaAlternativa(pathname: string, lang: Idioma): string {
  const p = limpia(pathname);
  const sinPrefijo = lang === 'en' ? p.replace(/^\/en(?=\/|$)/, '') || '/' : p;
  return rutaLocal(lang === 'es' ? 'en' : 'es', sinPrefijo);
}
