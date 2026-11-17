import type { Idioma } from '../lib/content';

// Los textos que escriben las páginas por su cuenta, en cada idioma. Lo que
// viene de las colecciones (títulos, cuerpos, etiquetas de estado) no pasa por
// aquí: ya llega traducido desde src/lib/content.ts.

export interface TextosPaginas {
  inicio: {
    descripcion: string;
    autor: string;
    rol: string;
    ubicacion: string;
    stack: string;
    stackValor: (n: number) => string;
  };
  sobreMi: {
    descripcion: (titular: string) => string;
    notaStack: string;
    stack: string;
    experiencia: string;
    proyectosDelPuesto: string;
    educacion: string;
    certificaciones: string;
    presente: string;
    columnas: { nombre: string; fecha: string; emisor: string; archivo: string };
    ver: string;
    verificar: string;
    /** aria-label de [ver]. */
    verCertificado: (nombre: string) => string;
    /** aria-label de [ver] en educación. */
    verTitulo: (nombre: string) => string;
    /** aria-label de [verificar]. */
    verificarCertificado: (nombre: string) => string;
    horas: string;
  };
  contacto: { descripcion: (nombre: string) => string };
  proyectos: { descripcion: string; volver: string };
  publicaciones: { descripcion: string; volver: string; abrirDoi: string; abrirOriginal: string };
  stack: {
    descripcion: (tech: string, usos: number) => string;
    volver: string;
    fuente: { proyecto: string; experiencia: string };
  };
  modalidad: Record<string, string>;
}

export const TEXTOS_PAGINAS: Record<Idioma, TextosPaginas> = {
  es: {
    inicio: {
      descripcion:
        'Desarrollador backend Java. Proyectos, publicaciones y notas, en una terminal que se navega con comandos o con clic.',
      autor: 'autor',
      rol: 'rol',
      ubicacion: 'ubicación',
      stack: 'stack',
      stackValor: (n) => `${n} tecnologías, contadas desde los datos`,
    },
    sobreMi: {
      descripcion: (titular) =>
        `${titular}. Experiencia, formación, certificaciones y el stack calculado desde los datos.`,
      notaStack: '# no está escrito a mano: se suma desde lo que declara cada trabajo y cada proyecto',
      stack: 'stack',
      experiencia: 'experiencia',
      proyectosDelPuesto: 'proyectos',
      educacion: 'educación',
      certificaciones: 'certificaciones y cursos',
      presente: 'presente',
      columnas: { nombre: 'nombre', fecha: 'fecha', emisor: 'emisor', archivo: 'archivo' },
      ver: '[ver]',
      verificar: '[verificar]',
      verCertificado: (n) => `ver el certificado ${n}`,
      verTitulo: (n) => `ver el título ${n}`,
      verificarCertificado: (n) => `verificar el certificado ${n} (se abre en una pestaña nueva)`,
      horas: 'h',
    },
    contacto: {
      descripcion: (nombre) => `Correo, WhatsApp, GitHub, LinkedIn y ORCID de ${nombre}.`,
    },
    proyectos: {
      descripcion:
        'Lo que he construido: plataformas en producción, herramientas y trabajo de investigación, con el stack de cada uno.',
      volver: 'volver a proyectos',
    },
    publicaciones: {
      descripcion: 'Producción académica revisada por pares, con su DOI y el enlace al editor.',
      volver: 'volver a publicaciones',
      abrirDoi: 'abrir el DOI',
      abrirOriginal: 'abrir el original',
    },
    stack: {
      descripcion: (tech, usos) => `Dónde he usado ${tech}: ${usos} trabajos o proyectos.`,
      volver: '← volver al stack',
      fuente: { proyecto: 'proyecto', experiencia: 'experiencia' },
    },
    modalidad: { presencial: 'presencial', remoto: 'remoto', híbrido: 'híbrido' },
  },
  en: {
    inicio: {
      descripcion:
        'Java backend developer. Projects, publications and notes, in a terminal you can navigate with commands or by clicking.',
      autor: 'author',
      rol: 'role',
      ubicacion: 'location',
      stack: 'stack',
      stackValor: (n) => `${n} technologies, counted from the data`,
    },
    sobreMi: {
      descripcion: (titular) =>
        `${titular}. Experience, education, certifications and the stack computed from the data.`,
      notaStack: '# not written by hand: it is summed from what each job and each project declares',
      stack: 'stack',
      experiencia: 'experience',
      proyectosDelPuesto: 'projects',
      educacion: 'education',
      certificaciones: 'certifications and courses',
      presente: 'present',
      columnas: { nombre: 'name', fecha: 'date', emisor: 'issuer', archivo: 'file' },
      ver: '[view]',
      verificar: '[verify]',
      verCertificado: (n) => `view the ${n} certificate`,
      verTitulo: (n) => `view the ${n} degree`,
      verificarCertificado: (n) => `verify the ${n} certificate (opens in a new tab)`,
      horas: 'h',
    },
    contacto: {
      descripcion: (nombre) => `Email, WhatsApp, GitHub, LinkedIn and ORCID of ${nombre}.`,
    },
    proyectos: {
      descripcion:
        'What I have built: production platforms, tools and research work, with the stack of each one.',
      volver: 'back to projects',
    },
    publicaciones: {
      descripcion: 'Peer-reviewed academic output, with its DOI and a link to the publisher.',
      volver: 'back to publications',
      abrirDoi: 'open the DOI',
      abrirOriginal: 'open the original',
    },
    stack: {
      descripcion: (tech, usos) => `Where I have used ${tech}: ${usos} jobs or projects.`,
      volver: '← back to the stack',
      fuente: { proyecto: 'project', experiencia: 'experience' },
    },
    modalidad: { presencial: 'on-site', remoto: 'remote', híbrido: 'hybrid' },
  },
};
