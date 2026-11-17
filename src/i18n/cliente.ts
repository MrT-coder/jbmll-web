import type { Idioma } from '../lib/content';

// Los textos que los scripts del navegador (terminal.ts, sidebar.ts, visor.ts)
// necesitan en tiempo de ejecución. Es JSON puro —sin funciones— porque viaja
// dentro de indice.json (terminal) y de atributos data-* (barra y visor, que no
// hacen fetch). Los huecos se escriben {0}, {1}: ver `llenar()` en terminal.ts.
// Solo `import type` acá: este archivo llega al navegador y no puede arrastrar
// astro:content.

export interface TextosTerminal {
  /** Etiqueta accesible del campo de comandos. */
  campo: string;
  /** Pista del prompt en escritorio y placeholder en táctil. */
  tocar: string;
  sugerencias: string;
  barraTeclas: string;
  teclaTab: string;
  teclaArriba: string;
  teclaAbajo: string;
  teclaEsc: string;
  teclaEjecutar: string;
  /** Plantilla de «ejecutar <comando>»: {0}. */
  ejecutar: string;
  /** [comando, descripción]; el primer término del comando completa con Tab. */
  ayuda: [string, string][];
  /** El nombre de «contacto» en este idioma y sus sinónimos → comando interno. */
  alias: Record<string, string>;
  /** Nombres a la vista de las secciones → su slug, para `cd`. */
  seccionAlias: Record<string, string>;
  cdNoExiste: string;
  pistaLs: string;
  faltaArg: string;
  noExiste: string;
  sinCuerpo: string;
  noCmd: string;
  pistaHelp: string;
  /** Argumento de toLocaleString para `date`. */
  locale: string;
}

export interface TextosSidebar {
  actual: string;
  visitado: string;
  sinVisitar: string;
  leyendo: string;
  leido: string;
  nadaAbierto: string;
  abiertoUno: string;
  abiertoMuchos: string;
  menuDialogo: string;
  tipos: Record<string, string>;
}

export interface TextosVisor {
  abrirPdf: string;
  noPdf: string;
}

export interface TextosCliente {
  terminal: TextosTerminal;
  sidebar: TextosSidebar;
  visor: TextosVisor;
}

export const TEXTOS_CLIENTE: Record<Idioma, TextosCliente> = {
  es: {
    terminal: {
      campo: 'Línea de comandos',
      tocar: 'toque aquí para escribir',
      sugerencias: 'Sugerencias',
      barraTeclas: 'Teclas y comandos rápidos',
      teclaTab: 'Tab (Tabulador)',
      teclaArriba: 'Historial anterior',
      teclaAbajo: 'Historial siguiente',
      teclaEsc: 'Esc (Escape)',
      teclaEjecutar: 'Ejecutar',
      ejecutar: 'Ejecutar {0}',
      ayuda: [
        ['ls', 'Listar lo que hay aquí'],
        ['cd <sección>', 'Entrar en una sección'],
        ['cd ~', 'Volver al inicio'],
        ['whoami', 'Quién soy'],
        ['stack', 'Con qué trabajo, contado desde los datos'],
        ['contacto', 'Dónde encontrarme'],
        ['pwd', 'Dónde estoy'],
        ['c', 'Limpiar y volver al inicio'],
        ['help', 'Esto'],
      ],
      alias: {},
      seccionAlias: {},
      cdNoExiste: 'cd: {0}: no existe',
      pistaLs: "Escriba 'ls' para ver qué hay.",
      faltaArg: '{0}: falta el argumento',
      noExiste: '{0}: {1}: no existe',
      sinCuerpo: '{0}: no tiene cuerpo propio',
      noCmd: '{0}: comando no encontrado',
      pistaHelp: "Escriba 'help', o pulse Tab para ver qué hay.",
      locale: 'es-EC',
    },
    sidebar: {
      actual: 'actual',
      visitado: 'visitado',
      sinVisitar: 'sin visitar',
      leyendo: 'leyendo',
      leido: 'leído',
      nadaAbierto: 'nada abierto',
      abiertoUno: 'abierto',
      abiertoMuchos: 'abiertos',
      menuDialogo: 'Menú',
      tipos: { proyecto: 'proyecto', publicacion: 'publicación', stack: 'stack' },
    },
    visor: {
      abrirPdf: 'abrir el PDF',
      noPdf: 'El navegador no pudo mostrar el PDF. ',
    },
  },
  en: {
    terminal: {
      campo: 'Command line',
      tocar: 'tap here to type',
      sugerencias: 'Suggestions',
      barraTeclas: 'Keys and quick commands',
      teclaTab: 'Tab',
      teclaArriba: 'Previous history',
      teclaAbajo: 'Next history',
      teclaEsc: 'Esc (Escape)',
      teclaEjecutar: 'Run',
      ejecutar: 'Run {0}',
      ayuda: [
        ['ls', 'List what is here'],
        ['cd <section>', 'Enter a section'],
        ['cd ~', 'Back to the start'],
        ['whoami', 'Who I am'],
        ['stack', 'What I work with, told from the data'],
        ['contact', 'Where to find me'],
        ['pwd', 'Where am I'],
        ['c', 'Clear and go back to the start'],
        ['help', 'This'],
      ],
      alias: { contact: 'contacto' },
      seccionAlias: {
        about: 'sobre-mi',
        projects: 'proyectos',
        publications: 'publicaciones',
        contact: 'contacto',
      },
      cdNoExiste: 'cd: {0}: no such section',
      pistaLs: "Type 'ls' to see what is here.",
      faltaArg: '{0}: missing argument',
      noExiste: '{0}: {1}: not found',
      sinCuerpo: '{0}: has no page of its own',
      noCmd: '{0}: command not found',
      pistaHelp: "Type 'help', or press Tab to see what is available.",
      locale: 'en-US',
    },
    sidebar: {
      actual: 'current',
      visitado: 'visited',
      sinVisitar: 'not visited',
      leyendo: 'reading',
      leido: 'read',
      nadaAbierto: 'nothing open',
      abiertoUno: 'open',
      abiertoMuchos: 'open',
      menuDialogo: 'Menu',
      tipos: { proyecto: 'project', publicacion: 'publication', stack: 'stack' },
    },
    visor: {
      abrirPdf: 'open the PDF',
      noPdf: 'The browser could not display the PDF. ',
    },
  },
};
