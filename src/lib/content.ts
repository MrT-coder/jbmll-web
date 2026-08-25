import { getCollection, type CollectionEntry } from 'astro:content';
import { perfil, enlacesDeContacto } from '../data/perfil';
import type { Fila, Indice, Seccion, TipoDeSeccion, UsoDeStack } from './tipos';

// La única puerta a los datos. Todo el sitio lee por aquí y nada más sabe de
// dónde sale el contenido. Cambiar los archivos por D1 es reescribir este
// archivo; las páginas no se enteran.

export type Experiencia = CollectionEntry<'experiencia'>;
export type Proyecto = CollectionEntry<'proyectos'>;
export type Publicacion = CollectionEntry<'publicaciones'>;
export type Educacion = CollectionEntry<'educacion'>;
export type Certificacion = CollectionEntry<'certificaciones'>;

// Más reciente primero. El orden lexicográfico de AAAA-MM ya es el cronológico.
const porFecha = (a: string, b: string) => b.localeCompare(a);

/** Un puesto sin fecha de fin sigue vigente y va siempre arriba. */
export async function getExperiencia(): Promise<Experiencia[]> {
  const todo = await getCollection('experiencia');
  return todo.sort((a, b) => {
    if (!a.data.fin && b.data.fin) return -1;
    if (a.data.fin && !b.data.fin) return 1;
    return porFecha(a.data.inicio, b.data.inicio);
  });
}

export async function getProyectos(): Promise<Proyecto[]> {
  const todo = await getCollection('proyectos', ({ data }) => !data.borrador);
  return todo.sort((a, b) => porFecha(a.data.fecha, b.data.fecha));
}

export async function getPublicaciones(): Promise<Publicacion[]> {
  const todo = await getCollection('publicaciones', ({ data }) => !data.borrador);
  return todo.sort((a, b) => b.data.anio - a.data.anio);
}

export async function getEducacion(): Promise<Educacion[]> {
  const todo = await getCollection('educacion');
  return todo.sort((a, b) => porFecha(a.data.inicio, b.data.inicio));
}

export async function getCertificaciones(): Promise<Certificacion[]> {
  const todo = await getCollection('certificaciones');
  // Las que no tienen fecha van al final: sin fecha no hay dónde colocarlas y
  // el principio es el peor lugar para adivinar.
  return todo.sort((a, b) => {
    if (!a.data.fecha && !b.data.fecha) return a.data.nombre.localeCompare(b.data.nombre);
    if (!a.data.fecha) return 1;
    if (!b.data.fecha) return -1;
    return porFecha(a.data.fecha, b.data.fecha);
  });
}

/**
 * Una entrada solo tiene página propia si tiene cuerpo. Una publicación que se
 * agota en su enlace al editor no necesita una página que repita el título y
 * poco más: eso es thin content y compite consigo mismo en los buscadores.
 */
export function tieneCuerpo(entrada: { body?: string }): boolean {
  return (entrada.body ?? '').trim().length > 0;
}

// El tipo vive en tipos.ts, con el resto de lo que cruza al cliente.
export type { UsoDeStack } from './tipos';

/**
 * El stack no se escribe: se calcula sumando lo que declara cada trabajo y cada
 * proyecto. Por construcción no se puede inflar — una tecnología sin ninguna
 * entrada que la declare simplemente no aparece.
 *
 * Una entrada que enlaza a un proyecto no aporta su propio stack: es el mismo
 * trabajo contado dos veces.
 */
export async function getStack(): Promise<UsoDeStack[]> {
  const [experiencia, proyectos] = await Promise.all([getExperiencia(), getProyectos()]);

  const acc = new Map<string, UsoDeStack>();

  const sumar = (
    tech: string,
    fuente: { tipo: 'experiencia' | 'proyecto'; id: string; titulo: string },
  ) => {
    const actual = acc.get(tech) ?? { tech, usos: 0, fuentes: [] };
    actual.usos += 1;
    actual.fuentes.push(fuente);
    acc.set(tech, actual);
  };

  for (const e of experiencia) {
    if (e.data.proyecto) continue;
    for (const tech of e.data.st) {
      sumar(tech, { tipo: 'experiencia', id: e.id, titulo: `${e.data.puesto} · ${e.data.organizacion}` });
    }
  }

  for (const p of proyectos) {
    for (const tech of p.data.st) {
      sumar(tech, { tipo: 'proyecto', id: p.id, titulo: p.data.titulo });
    }
  }

  // Por frecuencia; a igual número, alfabético, para que el orden no dependa
  // de en qué orden se leyeron los archivos.
  return [...acc.values()].sort((a, b) => b.usos - a.usos || a.tech.localeCompare(b.tech));
}

/**
 * El perfil pasa por la misma puerta que el resto. Hoy sale de un módulo; en
 * cuanto el contenido viva en D1 saldrá de ahí, y quien lo lee no cambia.
 */
export function getPerfil() {
  return { ...perfil, contacto: enlacesDeContacto() };
}

/** Una tecnología solo merece página propia si hay algo que listar en ella. */
export const MINIMO_PARA_PAGINA_DE_STACK = 2;

export async function getStackConPagina(): Promise<UsoDeStack[]> {
  const stack = await getStack();
  return stack.filter((s) => s.usos >= MINIMO_PARA_PAGINA_DE_STACK);
}

// ── El índice ───────────────────────────────────────────────────────────────
// La proyección plana que consume el renderizador. Se define aquí, junto a los
// datos, porque decidir qué entra en la vista es decidir sobre los datos.

export const SECCIONES: { slug: string; desc: string; tipo: TipoDeSeccion }[] = [
  { slug: 'sobre-mi', desc: 'quién soy y con qué trabajo', tipo: 'pagina' },
  { slug: 'proyectos', desc: 'lo que he construido', tipo: 'coleccion' },
  { slug: 'publicaciones', desc: 'producción académica, con DOI', tipo: 'coleccion' },
  { slug: 'contacto', desc: 'dónde encontrarme', tipo: 'pagina' },
];

function filaDeProyecto(p: Proyecto): Fila {
  const estados: Record<string, string> = {
    produccion: 'en producción',
    activo: 'activo',
    tesis: 'tesis',
    archivado: 'archivado',
  };
  return {
    slug: p.id,
    titulo: p.data.titulo,
    desc: p.data.desc,
    href: `/proyectos/${p.id}`,
    st: [...p.data.st],
    kw: [...p.data.kw],
    meta: [estados[p.data.estado], p.data.organizacion, p.data.fecha]
      .filter(Boolean)
      .join(' · '),
  };
}

function filaDePublicacion(pub: Publicacion): Fila {
  // Sin cuerpo propio no hay página: solo la fila y el enlace al editor. Una
  // página que repite el título para mandarte a otro sitio compite consigo
  // misma en los buscadores.
  const propia = tieneCuerpo(pub);
  const doi = pub.data.doi ? `https://doi.org/${pub.data.doi}` : pub.data.url;

  return {
    slug: pub.id,
    titulo: pub.data.titulo,
    desc: [pub.data.venue, pub.data.serie, pub.data.paginas].filter(Boolean).join(' · '),
    href: propia ? `/publicaciones/${pub.id}` : null,
    externo: doi ? { href: doi, etiqueta: pub.data.doi ? 'DOI' : 'enlace' } : undefined,
    st: [],
    kw: [...pub.data.kw],
    meta: `${pub.data.anio} · ${pub.data.autores.join('; ')}`,
  };
}

export async function getIndice(): Promise<Indice> {
  const [proyectos, publicaciones, stack] = await Promise.all([
    getProyectos(),
    getPublicaciones(),
    getStack(),
  ]);

  const entradas: Record<string, Fila[]> = {
    'sobre-mi': [],
    proyectos: proyectos.map(filaDeProyecto),
    publicaciones: publicaciones.map(filaDePublicacion),
    contacto: [],
  };

  const secciones: Seccion[] = SECCIONES.map((s) => ({
    ...s,
    n: entradas[s.slug]?.length ?? 0,
  }));

  return { secciones, entradas, stack };
}

/**
 * Vecinos dentro de una colección ya ordenada. Llegar al final de un artículo y
 * no tener a dónde ir es el momento exacto en que alguien cierra la pestaña.
 *
 * El orden lo decide quien listó la colección, no esta función: así el enlace
 * «siguiente» lleva siempre a lo que está debajo en el índice.
 */
export function vecinos<T extends { id: string }>(
  coleccion: T[],
  id: string,
): { anterior: T | null; siguiente: T | null } {
  const i = coleccion.findIndex((e) => e.id === id);
  if (i === -1) return { anterior: null, siguiente: null };
  return {
    anterior: coleccion[i - 1] ?? null,
    siguiente: coleccion[i + 1] ?? null,
  };
}

export type Pagina = CollectionEntry<'paginas'>;

/**
 * Una página singular por su identificador. La prosa se escribe en Markdown y
 * los bloques de datos los arma el sitio: así lo libre se escribe libre y lo
 * que se calcula no se puede desincronizar a mano.
 */
export async function getPagina(id: string): Promise<Pagina | null> {
  const todas = await getCollection('paginas');
  return todas.find((p) => p.id === id) ?? null;
}
