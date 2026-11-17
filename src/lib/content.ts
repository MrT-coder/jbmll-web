import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import { enlacesDeContacto } from '../data/perfil';
import type { Fila, Indice, Seccion, Tech, TipoDeSeccion, UsoDeStack, Workspace } from './tipos';
import { slugTech } from './render';
import { rutaLocal } from '../i18n/rutas';
import { TEXTOS_CLIENTE } from '../i18n/cliente';

// La única puerta a los datos. Todo el sitio lee por aquí y nada más sabe de
// dónde sale el contenido. Cambiar los archivos por D1 es reescribir este
// archivo; las páginas no se enteran.

export type Experiencia = CollectionEntry<'experiencia'>;
export type Proyecto = CollectionEntry<'proyectos'>;
export type Publicacion = CollectionEntry<'publicaciones'>;
export type Educacion = CollectionEntry<'educacion'>;
export type Certificacion = CollectionEntry<'certificaciones'>;
export type Perfil = CollectionEntry<'perfil'>['data'];

// ── Idioma ──────────────────────────────────────────────────────────────────
// El español vive en la raíz de cada colección y el inglés en una subcarpeta
// `en/` con el mismo nombre de archivo (`experiencia/en/firmaseguraec.md`). El
// `id` de la entrada traducida llega como `en/firmaseguraec`; aquí se le quita
// el prefijo para que el resto del sitio siga hablando de «firmaseguraec» sin
// saber en qué idioma está. Lo que aún no tiene traducción cae al español: una
// página a medio traducir es mejor que un hueco.
export type Idioma = 'es' | 'en';
export const IDIOMAS: Idioma[] = ['es', 'en'];

const PREFIJO_EN = 'en/';

export function deIdioma<T extends { id: string }>(todo: T[], lang: Idioma): T[] {
  const base = todo.filter((e) => !e.id.startsWith(PREFIJO_EN));
  if (lang === 'es') return base;
  const traducidas = new Map(
    todo.filter((e) => e.id.startsWith(PREFIJO_EN)).map((e) => [e.id.slice(PREFIJO_EN.length), e]),
  );
  return base.map((e) => {
    const t = traducidas.get(e.id);
    return t ? { ...t, id: e.id } : e;
  });
}

// Más reciente primero. El orden lexicográfico de AAAA-MM ya es el cronológico.
const porFecha = (a: string, b: string) => b.localeCompare(a);

/** Un puesto sin fecha de fin sigue vigente y va siempre arriba. */
export async function getExperiencia(lang: Idioma = 'es'): Promise<Experiencia[]> {
  const todo = deIdioma(await getCollection('experiencia'), lang);
  return todo.sort((a, b) => {
    if (!a.data.fin && b.data.fin) return -1;
    if (a.data.fin && !b.data.fin) return 1;
    return porFecha(a.data.inicio, b.data.inicio);
  });
}

export async function getProyectos(lang: Idioma = 'es'): Promise<Proyecto[]> {
  const todo = deIdioma(await getCollection('proyectos'), lang).filter((e) => !e.data.borrador);
  return todo.sort((a, b) => porFecha(a.data.fecha, b.data.fecha));
}

export async function getPublicaciones(lang: Idioma = 'es'): Promise<Publicacion[]> {
  const todo = deIdioma(await getCollection('publicaciones'), lang).filter((e) => !e.data.borrador);
  return todo.sort((a, b) => b.data.anio - a.data.anio);
}

export async function getEducacion(lang: Idioma = 'es'): Promise<Educacion[]> {
  const todo = deIdioma(await getCollection('educacion'), lang);
  return todo.sort((a, b) => porFecha(a.data.inicio, b.data.inicio));
}

export async function getCertificaciones(lang: Idioma = 'es'): Promise<Certificacion[]> {
  const todo = (await getCollection('certificaciones')).map((c) =>
    lang === 'en'
      ? {
          ...c,
          data: {
            ...c.data,
            nombre: c.data.nombre_en ?? c.data.nombre,
            emisor: c.data.emisor_en ?? c.data.emisor,
          },
        }
      : c,
  );
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
export async function getStack(lang: Idioma = 'es'): Promise<UsoDeStack[]> {
  const [experiencia, proyectos] = await Promise.all([getExperiencia(lang), getProyectos(lang)]);

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
    if (e.data.proyectos.length > 0) continue;
    for (const tech of e.data.st) {
      sumar(tech, {
        tipo: 'experiencia',
        id: e.id,
        titulo: `${e.data.puesto} · ${e.data.organizacion}`,
        // Mismo formato que el `periodo()` de sobre-mi.astro: sin fecha de fin,
        // el puesto sigue vigente.
        detalle: `${e.data.inicio} — ${e.data.fin ?? (lang === 'en' ? 'present' : 'presente')}`,
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
export async function getPerfil(lang: Idioma = 'es') {
  const entrada = await getEntry('perfil', 'perfil');
  if (!entrada) throw new Error('getPerfil: falta la entrada «perfil» en src/content/perfil.yaml');
  let datos = entrada.data;
  if (lang === 'en') {
    // Solo se superpone lo traducible; contacto y enlaces son el mismo dato.
    const en = (await getEntry('perfilEn', 'perfil'))?.data;
    if (en) {
      datos = {
        ...datos,
        titular: en.titular ?? datos.titular,
        ubicacion: en.ubicacion ?? datos.ubicacion,
        disponibilidad: en.disponibilidad ?? datos.disponibilidad,
        resumen: en.resumen ?? datos.resumen,
        idiomas: en.idiomas.length ? en.idiomas : datos.idiomas,
        foto: datos.foto && { ...datos.foto, alt: en.foto_alt ?? datos.foto.alt },
        distribuidor: datos.distribuidor && {
          ...datos.distribuidor,
          etiqueta: en.distribuidor_etiqueta ?? datos.distribuidor.etiqueta,
          divulgacion: en.distribuidor_divulgacion ?? datos.distribuidor.divulgacion,
        },
      };
    }
  }
  return { ...datos, contacto: enlacesDeContacto(datos) };
}

type PerfilConContacto = Awaited<ReturnType<typeof getPerfil>>;

/** Una tecnología solo merece página propia si hay algo que listar en ella. */
export const MINIMO_PARA_PAGINA_DE_STACK = 2;

export async function getStackConPagina(lang: Idioma = 'es'): Promise<UsoDeStack[]> {
  const stack = await getStack(lang);
  return stack.filter((s) => s.usos >= MINIMO_PARA_PAGINA_DE_STACK);
}

/**
 * Las tecnologías con página propia, como conjunto de nombres. Es la única
 * fuente de verdad sobre si un chip de tecnología enlaza: `panel()`,
 * `sobre-mi.astro` y `proyectos/[slug].astro` pintaban ese mismo chip cada
 * uno por su cuenta, y por eso enlazaban a páginas que `getStaticPaths` de
 * `/stack/[tech]` nunca generó.
 */
export async function getTechsConPagina(lang: Idioma = 'es'): Promise<Set<string>> {
  const stack = await getStackConPagina(lang);
  return new Set(stack.map((s) => s.tech));
}

function techDe(tech: string, conPagina: Set<string>, lang: Idioma): Tech {
  return { tech, href: conPagina.has(tech) ? rutaLocal(lang, `/stack/${slugTech(tech)}`) : null };
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
 * Lo que cambia de cada sección según el idioma: la descripción de la barra
 * lateral, el título de pestaña y el lead. Los slugs y el tipo no cambian.
 */
const TEXTOS_SECCION: Record<Idioma, Record<string, { desc: string; titulo: string; lead: string }>> = {
  es: {
    'sobre-mi': { desc: 'quién soy y con qué trabajo', titulo: 'Sobre mí — JBMLL', lead: '' },
    proyectos: { desc: 'lo que he construido', titulo: 'Proyectos — JBMLL', lead: 'Lo que he construido.' },
    publicaciones: {
      desc: 'producción académica, con DOI',
      titulo: 'Publicaciones — JBMLL',
      lead: 'Producción académica, con DOI.',
    },
    contacto: { desc: 'dónde encontrarme', titulo: 'Contacto — JBMLL', lead: 'Dónde encontrarme.' },
  },
  en: {
    'sobre-mi': { desc: 'who I am and what I work with', titulo: 'About — JBMLL', lead: '' },
    proyectos: { desc: 'what I have built', titulo: 'Projects — JBMLL', lead: 'What I have built.' },
    publicaciones: {
      desc: 'academic output, with DOI',
      titulo: 'Publications — JBMLL',
      lead: 'Academic output, with DOI.',
    },
    contacto: { desc: 'where to find me', titulo: 'Contact — JBMLL', lead: 'Where to find me.' },
  },
};

/**
 * Cómo se llama cada sección a la vista. La URL y el slug son los mismos en los
 * dos idiomas; lo que cambia es el nombre que se lee en la barra y en `ls`.
 */
const NOMBRE_EN: Record<string, string> = {
  'sobre-mi': 'about',
  proyectos: 'projects',
  publicaciones: 'publications',
  contacto: 'contact',
};

export function nombreDeSeccion(slug: string, lang: Idioma): string {
  return lang === 'en' ? (NOMBRE_EN[slug] ?? slug) : slug;
}

/** Las secciones con sus textos en el idioma pedido. */
export function seccionesDe(lang: Idioma) {
  return SECCIONES.map((s) => ({ ...s, desc: TEXTOS_SECCION[lang][s.slug].desc, titulo: TEXTOS_SECCION[lang][s.slug].titulo }));
}

/**
 * El lead de cada sección. El de sobre-mi repite el nombre que ya trae el
 * perfil —no se vuelve a escribir a mano—; los demás no dependen de él y
 * quedan fijos aquí mismo.
 */
function leadDeSeccion(slug: string, perfil: PerfilConContacto, lang: Idioma): string {
  if (slug === 'sobre-mi') return perfil.nombre;
  return TEXTOS_SECCION[lang][slug]?.lead ?? '';
}

/**
 * El título de pestaña y el lead del inicio. `navegar()` necesita esa misma
 * pareja para reponerlos al volver a `~` sin recargar; ambos se arman sobre el
 * perfil ya resuelto, no se vuelven a escribir a mano.
 */
function inicioDe(perfil: PerfilConContacto, lang: Idioma): { titulo: string; lead: string } {
  const quien = `<strong>${perfil.nombre}</strong> (<span class="sig">${perfil.marca}</span>)`;
  return {
    titulo: `${perfil.nombre} — ${perfil.marca}`,
    lead: lang === 'en' ? `I am ${quien}, a backend developer.` : `Soy ${quien}, desarrollador backend.`,
  };
}

/**
 * El título y el lead de una sección, por slug. Única puerta para que las
 * páginas dejen de escribir esa pareja a mano: un slug que no existe es un
 * error de quien programa, no algo que la página deba tolerar en silencio.
 */
export async function seccionDe(
  slug: string,
  lang: Idioma = 'es',
): Promise<{ titulo: string; lead: string }> {
  const s = SECCIONES.find((sec) => sec.slug === slug);
  if (!s) throw new Error(`seccionDe: no existe la sección «${slug}»`);
  const perfil = await getPerfil(lang);
  return { titulo: TEXTOS_SECCION[lang][slug].titulo, lead: leadDeSeccion(slug, perfil, lang) };
}

// ── Barra lateral ────────────────────────────────────────────────────────────
// Un único origen para la lista de workspaces: la barra lateral y cualquier
// otra vista que necesite listar secciones leen de aquí, no escriben su propia
// copia.

/** Los workspaces con la ruta de cada idioma (`/proyectos` o `/en/proyectos`). */
export function workspacesDe(lang: Idioma): Workspace[] {
  return [
    { slug: '', ruta: rutaLocal(lang, '/'), nombre: '~' },
    ...SECCIONES.map((s) => ({
      slug: s.slug,
      ruta: rutaLocal(lang, `/${s.slug}`),
      nombre: nombreDeSeccion(s.slug, lang),
    })),
  ];
}

export const WORKSPACES: Workspace[] = workspacesDe('es');

/**
 * La segunda línea de cada workspace, como en herdr bajo cada repositorio. Los
 * conteos salen del índice, nunca escritos a mano: así no se pueden
 * desincronizar de lo que el sitio realmente lista.
 */
export function subtituloDeWorkspace(slug: string, indice: Indice, lang: Idioma = 'es'): string {
  const en = lang === 'en';
  switch (slug) {
    case '':
      return 'terminal';
    case 'sobre-mi':
      return 'whoami · stack';
    case 'proyectos': {
      const n = indice.entradas.proyectos?.length ?? 0;
      return `${n} ${en ? (n === 1 ? 'project' : 'projects') : n === 1 ? 'proyecto' : 'proyectos'}`;
    }
    case 'publicaciones': {
      const n = indice.entradas.publicaciones?.length ?? 0;
      return `${n} ${en ? (n === 1 ? 'publication' : 'publications') : n === 1 ? 'publicación' : 'publicaciones'}`;
    }
    case 'contacto':
      return en ? 'email · github' : 'correo · github';
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

/** Las mismas etiquetas, en inglés. El español sigue siendo la fuente que lee verify.mjs. */
const ETIQUETAS_ESTADO_EN: Record<Proyecto['data']['estado'], string> = {
  produccion: 'in production',
  construyendo: 'building',
  'prueba-de-concepto': 'proof of concept',
  archivado: 'archived',
  cancelado: 'cancelled',
};
const ETIQUETAS_CONTEXTO_EN: Record<NonNullable<Proyecto['data']['contexto']>, string> = {
  tesis: 'thesis',
  laboral: 'work',
  personal: 'personal',
  academico: 'academic',
};

export function etiquetaEstado(estado: Proyecto['data']['estado'], lang: Idioma = 'es'): string {
  return (lang === 'en' ? ETIQUETAS_ESTADO_EN : ETIQUETAS_ESTADO)[estado];
}

export function etiquetaContexto(contexto: NonNullable<Proyecto['data']['contexto']>, lang: Idioma = 'es'): string {
  return (lang === 'en' ? ETIQUETAS_CONTEXTO_EN : ETIQUETAS_CONTEXTO)[contexto];
}

function filaDeProyecto(p: Proyecto, conPagina: Set<string>, lang: Idioma): Fila {
  return {
    slug: p.id,
    titulo: p.data.titulo,
    desc: p.data.desc,
    href: rutaLocal(lang, `/proyectos/${p.id}`),
    st: p.data.st.map((tech) => techDe(tech, conPagina, lang)),
    kw: [...p.data.kw],
    estado: { clave: p.data.estado, etiqueta: etiquetaEstado(p.data.estado, lang) },
    contexto: p.data.contexto ? etiquetaContexto(p.data.contexto, lang) : undefined,
    meta: [p.data.organizacion, p.data.fecha].filter(Boolean).join(' · '),
  };
}

function filaDePublicacion(pub: Publicacion, lang: Idioma): Fila {
  // Sin cuerpo propio no hay página: solo la fila y el enlace al editor. Una
  // página que repite el título para mandarte a otro sitio compite consigo
  // misma en los buscadores.
  const propia = tieneCuerpo(pub);
  const doi = pub.data.doi ? `https://doi.org/${pub.data.doi}` : pub.data.url;

  return {
    slug: pub.id,
    titulo: pub.data.titulo,
    desc: [pub.data.venue, pub.data.serie, pub.data.paginas].filter(Boolean).join(' · '),
    href: propia ? rutaLocal(lang, `/publicaciones/${pub.id}`) : null,
    externo: doi ? { href: doi, etiqueta: pub.data.doi ? 'DOI' : lang === 'en' ? 'link' : 'enlace' } : undefined,
    st: [],
    kw: [...pub.data.kw],
    meta: `${pub.data.anio} · ${pub.data.autores.join('; ')}`,
  };
}

export async function getIndice(lang: Idioma = 'es'): Promise<Indice> {
  const [proyectos, publicaciones, stack, conPagina, perfil] = await Promise.all([
    getProyectos(lang),
    getPublicaciones(lang),
    getStack(lang),
    getTechsConPagina(lang),
    getPerfil(lang),
  ]);

  const entradas: Record<string, Fila[]> = {
    'sobre-mi': [],
    proyectos: proyectos.map((p) => filaDeProyecto(p, conPagina, lang)),
    publicaciones: publicaciones.map((p) => filaDePublicacion(p, lang)),
    contacto: [],
  };

  const secciones: Seccion[] = seccionesDe(lang).map((s) => ({
    ...s,
    lead: leadDeSeccion(s.slug, perfil, lang),
    nombre: nombreDeSeccion(s.slug, lang),
    href: rutaLocal(lang, `/${s.slug}`),
    n: entradas[s.slug]?.length ?? 0,
  }));

  return { lang, secciones, entradas, stack, inicio: inicioDe(perfil, lang), ui: TEXTOS_CLIENTE[lang] };
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
export async function getPagina(id: string, lang: Idioma = 'es'): Promise<Pagina | null> {
  const todas = deIdioma(await getCollection('paginas'), lang);
  return todas.find((p) => p.id === id) ?? null;
}
