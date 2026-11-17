// Cómo se agrupan las tecnologías en la sección de habilidades del CV.
//
// El stack no se escribe: se calcula desde lo que declaran los trabajos y los
// proyectos (ver getStack en src/lib/content.ts). Lo único que sí es una
// decisión editorial es en qué cajón va cada tecnología, y eso vive aquí. Una
// tecnología que no aparezca en esta tabla no se pierde: cae en «otras», para
// que un dato nuevo del CMS llegue al CV sin tocar código.
//
// El orden de las claves es el orden en que salen en el CV.

export const CATEGORIAS_STACK: Record<string, string[]> = {
  lenguajes: ['Java', 'JavaScript', 'TypeScript', 'PHP', 'Python', 'SQL'],
  backend: [
    'Spring Boot',
    'Spring AI',
    'Spring Modulith',
    'Laravel',
    'Filament',
    'FastAPI',
    'Feign',
    'Inertia.js',
  ],
  frontend: ['Vue.js', 'React', 'Nuxt', 'Astro', 'Tailwind CSS', 'Flet'],
  datos: ['PostgreSQL', 'MySQL', 'SQLite', 'Supabase'],
  cloud: ['Docker', 'GitHub Actions', 'Cloudflare'],
  ia: ['TensorFlow Lite', 'OpenCV', 'MediaPipe', 'Groq API', 'ElevenLabs'],
  testing: ['Pest', 'Vitest', 'Testcontainers', 'Playwright'],
};

/** Clave de la categoría que sobra: lo que ningún cajón reclama. */
export const CATEGORIA_RESTO = 'otras';

const normaliza = (s: string) => s.trim().toLowerCase();

const PORTECH = new Map(
  Object.entries(CATEGORIAS_STACK).flatMap(([cat, techs]) => techs.map((t) => [normaliza(t), cat] as const)),
);

export function categoriaDe(tech: string): string {
  return PORTECH.get(normaliza(tech)) ?? CATEGORIA_RESTO;
}

/** Las claves en el orden en que salen en el CV. */
export const ORDEN_CATEGORIAS = [...Object.keys(CATEGORIAS_STACK), CATEGORIA_RESTO];
