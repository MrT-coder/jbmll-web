import type { Idioma } from './content';

/**
 * El nombre del archivo del CV, sin extensión. Sale del nombre del perfil, no
 * de un literal: el dueño cambia el nombre en el CMS y el archivo lo sigue.
 * `josue-bladimir-morales-llanganate-cv-es`. Va en minúsculas y sin tildes
 * porque es parte de una URL.
 */
export function nombreDeCv(nombre: string, lang: Idioma): string {
  const slug = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug}-cv-${lang}`;
}

/** La ruta pública del PDF, la que lleva el botón de descarga. */
export function rutaDeCv(nombre: string, lang: Idioma): string {
  return `/cv/${nombreDeCv(nombre, lang)}.pdf`;
}
