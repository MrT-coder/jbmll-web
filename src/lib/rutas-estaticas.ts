import {
  getProyectos,
  getPublicaciones,
  getStackConPagina,
  getTechsConPagina,
  tieneCuerpo,
  vecinos,
  type Idioma,
} from './content';
import { slugTech } from './render';

// Las rutas estáticas de las páginas de detalle, una vez por idioma. Cada
// página bajo src/pages (la de español y la de /en/) llama a la función de su
// idioma desde getStaticPaths y le pasa las props a la misma vista de
// src/vistas: así las dos versiones no pueden diverger en qué páginas existen.

export async function rutasDeProyecto(lang: Idioma) {
  const [proyectos, conPagina] = await Promise.all([getProyectos(lang), getTechsConPagina(lang)]);
  return proyectos.map((p) => ({
    params: { slug: p.id },
    props: { lang, proyecto: p, conPagina, ...vecinos(proyectos, p.id) },
  }));
}

// Solo las que tienen algo propio que decir. Una publicación que se agota en su
// enlace al editor no genera página: sería un título repetido compitiendo con
// el original en los buscadores.
export async function rutasDePublicacion(lang: Idioma) {
  const conCuerpo = (await getPublicaciones(lang)).filter(tieneCuerpo);
  return conCuerpo.map((p) => ({
    params: { slug: p.id },
    props: { lang, publicacion: p, ...vecinos(conCuerpo, p.id) },
  }));
}

// Solo con dos o más usos. Una página que lista una sola cosa no aporta nada
// que la lista de origen no diga ya.
export async function rutasDeTecnologia(lang: Idioma) {
  const stack = await getStackConPagina(lang);
  return stack.map((s) => ({ params: { tech: slugTech(s.tech) }, props: { lang, uso: s } }));
}
