import type { Idioma } from '../lib/content';

// Los textos fijos del CV: títulos de sección y palabras sueltas. El contenido
// (puestos, proyectos, certificados) sale de las colecciones; esto es solo el
// marco que lo rodea. Los títulos son los que un ATS busca, así que se
// mantienen convencionales y no se adornan.

export interface EtiquetasCv {
  perfil: string;
  habilidades: string;
  experiencia: string;
  proyectos: string;
  publicaciones: string;
  educacion: string;
  certificaciones: string;
  idiomas: string;
  presente: string;
  stack: string;
  horas: string;
  credencial: string;
  registro: string;
  demo: string;
  repo: string;
  /** Abreviaturas de mes, enero a diciembre. */
  meses: string[];
  /** Etiquetas de las categorías de habilidades, por clave (ver categorias-stack.ts). */
  categorias: Record<string, string>;
  /** Etiquetas de los enlaces de contacto, por la `etiqueta` de enlacesDeContacto(). */
  contacto: Record<string, string>;
  /** El texto del enlace de descarga del sitio. */
  descargar: string;
  /** Un `<html lang>` y un nombre de archivo no necesitan más que el código. */
  documento: string;
}

export const ETIQUETAS_CV: Record<Idioma, EtiquetasCv> = {
  es: {
    perfil: 'Perfil Profesional',
    habilidades: 'Habilidades Técnicas',
    experiencia: 'Experiencia Profesional',
    proyectos: 'Proyectos Destacados',
    publicaciones: 'Publicaciones',
    educacion: 'Educación',
    certificaciones: 'Certificaciones y Cursos',
    idiomas: 'Idiomas',
    presente: 'Presente',
    stack: 'Tecnologías',
    horas: 'horas',
    credencial: 'ID de credencial',
    registro: 'Registro',
    demo: 'Demo',
    repo: 'Repositorio',
    meses: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
    categorias: {
      lenguajes: 'Lenguajes',
      backend: 'Backend y Frameworks',
      frontend: 'Frontend',
      datos: 'Bases de Datos',
      cloud: 'Cloud y DevOps',
      ia: 'IA / ML',
      testing: 'Testing',
      otras: 'Otras Tecnologías',
    },
    contacto: { correo: 'Correo', whatsapp: 'Teléfono', github: 'GitHub', linkedin: 'LinkedIn', orcid: 'ORCID' },
    descargar: 'descargar CV (PDF)',
    documento: 'es',
  },
  en: {
    perfil: 'Professional Summary',
    habilidades: 'Technical Skills',
    experiencia: 'Professional Experience',
    proyectos: 'Featured Projects',
    publicaciones: 'Publications',
    educacion: 'Education',
    certificaciones: 'Certifications and Courses',
    idiomas: 'Languages',
    presente: 'Present',
    stack: 'Technologies',
    horas: 'hours',
    credencial: 'Credential ID',
    registro: 'Registration',
    demo: 'Demo',
    repo: 'Repository',
    meses: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    categorias: {
      lenguajes: 'Languages',
      backend: 'Backend and Frameworks',
      frontend: 'Frontend',
      datos: 'Databases',
      cloud: 'Cloud and DevOps',
      ia: 'AI / ML',
      testing: 'Testing',
      otras: 'Other Technologies',
    },
    contacto: { correo: 'Email', whatsapp: 'Phone', github: 'GitHub', linkedin: 'LinkedIn', orcid: 'ORCID' },
    descargar: 'download CV (PDF)',
    documento: 'en',
  },
};
