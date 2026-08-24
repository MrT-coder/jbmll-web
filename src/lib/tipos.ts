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
}

export interface Fila {
  slug: string;
  titulo: string;
  desc: string;
  /** Ruta propia, o null si la entrada no merece página. */
  href: string | null;
  /** Enlace externo cuando la entrada vive fuera: un DOI, un repositorio. */
  externo?: { href: string; etiqueta: string };
  st: string[];
  kw: string[];
  /** Línea corta bajo el título: fechas, editorial, estado. */
  meta?: string;
}

export interface UsoDeStack {
  tech: string;
  usos: number;
  fuentes: { tipo: 'experiencia' | 'proyecto'; id: string; titulo: string }[];
}

export interface Indice {
  secciones: Seccion[];
  entradas: Record<string, Fila[]>;
  stack: UsoDeStack[];
}
