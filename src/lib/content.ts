import { getCollection, type CollectionEntry } from 'astro:content';
import { perfil, enlacesDeContacto } from '../data/perfil';

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

export interface UsoDeStack {
  /** Nombre de la tecnología, tal cual se declaró. */
  tech: string;
  /** Cuántas entradas la declaran. */
  usos: number;
  /** Dónde se usó, para que el número se pueda comprobar. */
  fuentes: { tipo: 'experiencia' | 'proyecto'; id: string; titulo: string }[];
}

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
