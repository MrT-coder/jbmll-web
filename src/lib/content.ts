import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import { enlacesDeContacto } from '../data/perfil';
import type { Fila, Indice, Seccion, Tech, TipoDeSeccion, UsoDeStack, Workspace } from './tipos';
import { slugTech } from './render';

// La única puerta a los datos. Todo el sitio lee por aquí y nada más sabe de
// dónde sale el contenido. Cambiar los archivos por D1 es reescribir este
// archivo; las páginas no se enteran.

export type Experiencia = CollectionEntry<'experiencia'>;
export type Proyecto = CollectionEntry<'proyectos'>;
export type Publicacion = CollectionEntry<'publicaciones'>;
export type Educacion = CollectionEntry<'educacion'>;
export type Certificacion = CollectionEntry<'certificaciones'>;
export type Perfil = CollectionEntry<'perfil'>['data'];

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
    fuente: { tipo: 'experiencia' | 'proyecto'; id: string; titulo: string; detalle: string },
  ) => {
    const actual = acc.get(tech) ?? { tech, usos: 0, fuentes: [] };
    actual.usos += 1;
    actual.fuentes.push(fuente);
    acc.set(tech, actual);
  };

  for (const e of experiencia) {
    if (e.data.proyecto) continue;
    for (const tech of e.data.st) {
      sumar(tech, {
        tipo: 'experiencia',
        id: e.id,
        titulo: `${e.data.puesto} · ${e.data.organizacion}`,
        // Mismo formato que el `periodo()` de sobre-mi.astro: sin fecha de fin,
        // el puesto sigue vigente.
        detalle: `${e.data.inicio} — ${e.data.fin ?? 'presente'}`,
      });
    }
  }

  for (const p of proyectos) {
    for (const tech of p.data.st) {
      sumar(tech, { tipo: 'proyecto', id: p.id, titulo: p.data.titulo, detalle: p.data.desc });
    }
  }

  // Por frecuencia; a igual número, alfabético, para que el orden no dependa
  // de en qué orden se leyeron los archivos.
  return [...acc.values()].sort((a, b) => b.usos - a.usos || a.tech.localeCompare(b.tech));
}

/**
 * El perfil pasa por la misma puerta que el resto. Vive en
 * src/content/perfil.yaml —única entrada de esa colección, id «perfil»— para
 * que un CMS basado en Git lo edite sin tocar TypeScript; los cálculos que sí
 * son código se quedan en src/data/perfil.ts.
 */
export async function getPerfil() {
  const entrada = await getEntry('perfil', 'perfil');
  if (!entrada) throw new Error('getPerfil: falta la entrada «perfil» en src/content/perfil.yaml');
  return { ...entrada.data, contacto: enlacesDeContacto(entrada.data) };
}

type PerfilConContacto = Awaited<ReturnType<typeof getPerfil>>;

/** Una tecnología solo merece página propia si hay algo que listar en ella. */
export const MINIMO_PARA_PAGINA_DE_STACK = 2;

export async function getStackConPagina(): Promise<UsoDeStack[]> {
  const stack = await getStack();
  return stack.filter((s) => s.usos >= MINIMO_PARA_PAGINA_DE_STACK);
}

/**
 * Las tecnologías con página propia, como conjunto de nombres. Es la única
 * fuente de verdad sobre si un chip de tecnología enlaza: `panel()`,
 * `sobre-mi.astro` y `proyectos/[slug].astro` pintaban ese mismo chip cada
 * uno por su cuenta, y por eso enlazaban a páginas que `getStaticPaths` de
 * `/stack/[tech]` nunca generó.
 */
export async function getTechsConPagina(): Promise<Set<string>> {
  const stack = await getStackConPagina();
  return new Set(stack.map((s) => s.tech));
}

function techDe(tech: string, conPagina: Set<string>): Tech {
  return { tech, href: conPagina.has(tech) ? `/stack/${slugTech(tech)}` : null };
}

// ── El índice ───────────────────────────────────────────────────────────────
// La proyección plana que consume el renderizador. Se define aquí, junto a los
// datos, porque decidir qué entra en la vista es decidir sobre los datos.

// Slug, tipo y título no dependen del perfil: los necesitan Terminal.astro (la
// línea de arranque) y WORKSPACES (la barra lateral) de forma síncrona, antes
// de que valga la pena esperar a una colección. El lead sí depende del
// perfil —al menos el de sobre-mi— y se calcula aparte, en leadDeSeccion().
export const SECCIONES: { slug: string; desc: string; tipo: TipoDeSeccion; titulo: string }[] = [
  { slug: 'sobre-mi', desc: 'quién soy y con qué trabajo', tipo: 'pagina', titulo: 'Sobre mí — JBMLL' },
  { slug: 'proyectos', desc: 'lo que he construido', tipo: 'coleccion', titulo: 'Proyectos — JBMLL' },
  {
    slug: 'publicaciones',
    desc: 'producción académica, con DOI',
    tipo: 'coleccion',
    titulo: 'Publicaciones — JBMLL',
  },
  { slug: 'contacto', desc: 'dónde encontrarme', tipo: 'pagina', titulo: 'Contacto — JBMLL' },
];

/**
 * El lead de cada sección. El de sobre-mi repite el nombre que ya trae el
 * perfil —no se vuelve a escribir a mano—; los demás no dependen de él y
 * quedan fijos aquí mismo.
 */
function leadDeSeccion(slug: string, perfil: PerfilConContacto): string {
  switch (slug) {
    case 'sobre-mi':
      return perfil.nombre;
    case 'proyectos':
      return 'Lo que he construido.';
    case 'publicaciones':
      return 'Producción académica, con DOI.';
    case 'contacto':
      return 'Dónde encontrarme.';
    default:
      return '';
  }
}

/**
 * El título de pestaña y el lead del inicio. `navegar()` necesita esa misma
 * pareja para reponerlos al volver a `~` sin recargar; ambos se arman sobre el
 * perfil ya resuelto, no se vuelven a escribir a mano.
 */
function inicioDe(perfil: PerfilConContacto): { titulo: string; lead: string } {
  return {
    titulo: `${perfil.nombre} — ${perfil.marca}`,
    lead: `Soy <strong>${perfil.nombre}</strong> (<span class="sig">${perfil.marca}</span>), desarrollador backend.`,
  };
}

/**
 * El título y el lead de una sección, por slug. Única puerta para que las
 * páginas dejen de escribir esa pareja a mano: un slug que no existe es un
 * error de quien programa, no algo que la página deba tolerar en silencio.
 */
export async function seccionDe(slug: string): Promise<{ titulo: string; lead: string }> {
  const s = SECCIONES.find((sec) => sec.slug === slug);
  if (!s) throw new Error(`seccionDe: no existe la sección «${slug}»`);
  const perfil = await getPerfil();
  return { titulo: s.titulo, lead: leadDeSeccion(slug, perfil) };
}

// ── Barra lateral ────────────────────────────────────────────────────────────
// Un único origen para la lista de workspaces: la barra lateral y cualquier
// otra vista que necesite listar secciones leen de aquí, no escriben su propia
// copia.

export const WORKSPACES: Workspace[] = [
  { slug: '', ruta: '/', nombre: '~' },
  ...SECCIONES.map((s) => ({ slug: s.slug, ruta: `/${s.slug}`, nombre: s.slug })),
];

/**
 * La segunda línea de cada workspace, como en herdr bajo cada repositorio. Los
 * conteos salen del índice, nunca escritos a mano: así no se pueden
 * desincronizar de lo que el sitio realmente lista.
 */
export function subtituloDeWorkspace(slug: string, indice: Indice): string {
  switch (slug) {
    case '':
      return 'terminal';
    case 'sobre-mi':
      return 'whoami · stack';
    case 'proyectos': {
      const n = indice.entradas.proyectos?.length ?? 0;
      return `${n} ${n === 1 ? 'proyecto' : 'proyectos'}`;
    }
    case 'publicaciones': {
      const n = indice.entradas.publicaciones?.length ?? 0;
      return `${n} ${n === 1 ? 'publicación' : 'publicaciones'}`;
    }
    case 'contacto':
      return 'correo · github';
    default:
      return '';
  }
}

/**
 * Las etiquetas del estado, exportadas para que la página de detalle
 * (proyectos/[slug].astro) lea la misma palabra que el índice en vez de
 * repetirla a mano — dos copias del mismo texto son dos oportunidades de que
 * se desalineen.
 */
export const ETIQUETAS_ESTADO: Record<Proyecto['data']['estado'], string> = {
  produccion: 'en producción',
  construyendo: 'construyendo',
  'prueba-de-concepto': 'prueba de concepto',
  archivado: 'archivado',
  cancelado: 'cancelado',
};

/** Mismo motivo que ETIQUETAS_ESTADO: una sola fuente para las dos vistas. */
export const ETIQUETAS_CONTEXTO: Record<NonNullable<Proyecto['data']['contexto']>, string> = {
  tesis: 'tesis',
  laboral: 'trabajo',
  personal: 'personal',
  academico: 'académico',
};

function filaDeProyecto(p: Proyecto, conPagina: Set<string>): Fila {
  return {
    slug: p.id,
    titulo: p.data.titulo,
    desc: p.data.desc,
    href: `/proyectos/${p.id}`,
    st: p.data.st.map((tech) => techDe(tech, conPagina)),
    kw: [...p.data.kw],
    estado: { clave: p.data.estado, etiqueta: ETIQUETAS_ESTADO[p.data.estado] },
    contexto: p.data.contexto ? ETIQUETAS_CONTEXTO[p.data.contexto] : undefined,
    meta: [p.data.organizacion, p.data.fecha].filter(Boolean).join(' · '),
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
  const [proyectos, publicaciones, stack, conPagina, perfil] = await Promise.all([
    getProyectos(),
    getPublicaciones(),
    getStack(),
    getTechsConPagina(),
    getPerfil(),
  ]);

  const entradas: Record<string, Fila[]> = {
    'sobre-mi': [],
    proyectos: proyectos.map((p) => filaDeProyecto(p, conPagina)),
    publicaciones: publicaciones.map(filaDePublicacion),
    contacto: [],
  };

  const secciones: Seccion[] = SECCIONES.map((s) => ({
    ...s,
    lead: leadDeSeccion(s.slug, perfil),
    n: entradas[s.slug]?.length ?? 0,
  }));

  return { secciones, entradas, stack, inicio: inicioDe(perfil) };
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
