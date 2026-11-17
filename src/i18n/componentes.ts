import type { Idioma } from '../lib/content';

// Los textos que los componentes .astro pintan en el servidor. Lo que además
// necesitan los scripts del navegador (plurales, «nada abierto», etiquetas de
// tipo…) vive en cliente.ts, y los componentes lo comparten desde allí.

export interface TextosComponentes {
  saltar: string;
  boot: {
    arrancando: string;
    montando: string;
    fuente: string;
    listo: string;
  };
  pie: { github: string };
  barra: {
    menu: string;
    cerrar: string;
    marca: string;
    navegacion: string;
    workspaces: string;
    abiertos: string;
    /** Prefijo del estado de la fila de abiertos: «leyendo» / «reading». */
    sinVisitar: string;
    actual: string;
    /** Texto visible del selector de idioma (el del idioma destino). */
    selectorTexto: string;
    /** Nombre accesible del selector, en el idioma destino. */
    selectorNombre: string;
  };
  visor: { cerrar: string; pie: string };
}

export const TEXTOS_COMPONENTES: Record<Idioma, TextosComponentes> = {
  es: {
    saltar: 'saltar al contenido',
    boot: {
      arrancando: 'jbsh 1.0 — arrancando',
      montando: 'montando',
      fuente: 'FiraCode Nerd Font Mono · subconjunto de 432 glifos',
      listo: 'listo',
    },
    pie: { github: 'github' },
    barra: {
      menu: 'menú',
      cerrar: 'Cerrar menú',
      marca: 'JBMLL, volver al inicio',
      navegacion: 'Workspaces',
      workspaces: 'workspaces',
      abiertos: 'abiertos',
      sinVisitar: 'sin visitar',
      actual: 'actual',
      selectorTexto: 'EN',
      selectorNombre: 'English version',
    },
    visor: { cerrar: 'Cerrar el visor', pie: 'cerrar' },
  },
  en: {
    saltar: 'skip to content',
    boot: {
      arrancando: 'jbsh 1.0 — booting',
      montando: 'mounting',
      fuente: 'FiraCode Nerd Font Mono · 432-glyph subset',
      listo: 'ready',
    },
    pie: { github: 'github' },
    barra: {
      menu: 'menu',
      cerrar: 'Close menu',
      marca: 'JBMLL, back to start',
      navegacion: 'Workspaces',
      workspaces: 'workspaces',
      abiertos: 'open',
      sinVisitar: 'not visited',
      actual: 'current',
      selectorTexto: 'ES',
      selectorNombre: 'Versión en español',
    },
    visor: { cerrar: 'Close the viewer', pie: 'close' },
  },
};
