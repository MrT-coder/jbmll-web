// Las formas planas con las que trabaja el renderizador.
//
// Son planas a propósito: el mismo módulo de render corre en el servidor hoy y
// en el navegador en cuanto la terminal navegue sin recargar. Lo que no sea
// serializable no puede cruzar esa frontera.

export type TipoDeSeccion = 'pagina' | 'coleccion';

export interface Seccion {
  slug: string;
  desc: string;
  tipo: TipoDeSeccion;
  /** Cuántas entradas tiene. Las páginas no cuentan nada. */
  n: number;
  /** El <title> de su página. */
  titulo: string;
  /** El h1 de su página. Puede traer HTML de confianza, como el del inicio. */
  lead: string;
}

export interface Tech {
  tech: string;
  /** Ruta de la página de la tecnología, o null si no tiene una propia. */
  href: string | null;
}

export interface Fila {
  slug: string;
  titulo: string;
  desc: string;
  /** Ruta propia, o null si la entrada no merece página. */
  href: string | null;
  /** Enlace externo cuando la entrada vive fuera: un DOI, un repositorio. */
  externo?: { href: string; etiqueta: string };
  st: Tech[];
  kw: string[];
  /**
   * El estado del ciclo de vida (solo proyectos: produccion, construyendo…),
   * con su clave —para la clase CSS que le da color— y su etiqueta ya
   * traducida. Va aparte de `meta` porque necesita pintarse con su propio
   * color; una publicación, que no tiene estado, deja esto sin definir.
   */
  estado?: { clave: string; etiqueta: string };
  /** El contexto de origen del proyecto (tesis, trabajo…), ya traducido. Es
   * opcional incluso cuando hay estado: no todo proyecto declara uno. */
  contexto?: string;
  /** Línea corta bajo el título: fechas, editorial. El estado y el contexto
   * de un proyecto se renderizan aparte (ver arriba), no como texto plano
   * mezclado en esta cadena — así el estado puede colorearse por su cuenta. */
  meta?: string;
}

export interface UsoDeStack {
  tech: string;
  usos: number;
  fuentes: {
    tipo: 'experiencia' | 'proyecto';
    id: string;
    titulo: string;
    /** Línea corta bajo el título de la fuente: la descripción del proyecto,
     * o el período del puesto cuando la fuente es una experiencia. */
    detalle: string;
  }[];
}

export interface Indice {
  secciones: Seccion[];
  entradas: Record<string, Fila[]>;
  stack: UsoDeStack[];
  /** El <title> y el h1 del inicio: la única sección que no vive en SECCIONES. */
  inicio: { titulo: string; lead: string };
}

// ── Barra lateral ────────────────────────────────────────────────────────────

/** Un workspace de la barra lateral: la raíz (`~`) o una sección. */
export interface Workspace {
  slug: string;
  ruta: string;
  nombre: string;
}

/** El tipo de documento que puede quedar «abierto» en la sesión. */
export type TipoDocumentoAbierto = 'proyecto' | 'publicacion' | 'stack';

/** Un documento de detalle: lo que la sección «abiertos» lista y persiste. */
export interface DocumentoAbierto {
  href: string;
  titulo: string;
  tipo: TipoDocumentoAbierto;
}
