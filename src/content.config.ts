import { defineCollection, z } from 'astro:content';
import { glob, file } from 'astro/loaders';

// Astro 7 usa la Content Layer y busca este archivo en src/content.config.ts.
// La ruta antigua, src/content/config.ts, está deprecada.

const base = (nombre: string) =>
  glob({ pattern: '**/*.md', base: `./src/content/${nombre}` });

// Un mes basta para ordenar y para mostrar. El día no aporta nada en un
// portafolio y obliga a inventarlo cuando no se recuerda. El mes también es
// opcional: hay entradas de las que solo consta el año, y exigirlo obligaría a
// inventar precisión que no existe.
const mes = z
  .string()
  .regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/, 'Formato AAAA o AAAA-MM, por ejemplo 2025-09');

// El orden lexicográfico de AAAA-MM coincide con el cronológico, así que
// ordenar no necesita convertir a fecha.

const experiencia = defineCollection({
  loader: base('experiencia'),
  schema: z.object({
    puesto: z.string(),
    organizacion: z.string(),
    ubicacion: z.string(),
    modalidad: z.enum(['presencial', 'remoto', 'híbrido']).optional(),
    inicio: mes,
    // Ausente significa «hasta hoy». Un valor centinela obligaría a recordar
    // cuál es, y tarde o temprano alguien lo compara con una fecha real.
    fin: mes.optional(),

    // Un puesto cuyo trabajo ya está descrito como proyecto no declara stack:
    // lo hereda de ahí. Si declarara el suyo, cada tecnología contaría dos
    // veces y el stack quedaría inflado sin que nadie mintiera.
    proyecto: z.string().optional(),
    st: z.array(z.string()).default([]),
    kw: z.array(z.string()).default([]),
  }),
});

const proyectos = defineCollection({
  loader: base('proyectos'),
  schema: z.object({
    titulo: z.string(),
    desc: z.string(),
    estado: z.enum(['produccion', 'activo', 'tesis', 'archivado']),
    organizacion: z.string().optional(),
    fecha: mes,

    // Sin stack, un proyecto no aporta nada al cálculo y es justo lo que el
    // sitio promete mostrar. Se exige al menos uno.
    st: z.array(z.string()).min(1),
    kw: z.array(z.string()).default([]),

    repo: z.string().url().optional(),
    demo: z.string().url().optional(),
    destacado: z.boolean().default(false),
    borrador: z.boolean().default(false),
  }),
});

const publicaciones = defineCollection({
  loader: base('publicaciones'),
  schema: z.object({
    titulo: z.string(),
    autores: z.array(z.string()).min(1),
    anio: z.number().int(),
    tipo: z.enum(['journal', 'conference', 'preprint', 'capitulo']),
    venue: z.string(),
    serie: z.string().optional(),
    editorial: z.string().optional(),
    paginas: z.string().optional(),
    doi: z.string().optional(),
    url: z.string().url().optional(),

    // El trabajo que dio origen al artículo. Igual que en experiencia, el
    // stack se hereda de ahí y no se vuelve a contar.
    proyecto: z.string().optional(),
    kw: z.array(z.string()).default([]),
    borrador: z.boolean().default(false),
  }),
});

const educacion = defineCollection({
  loader: base('educacion'),
  schema: z.object({
    titulo: z.string(),
    institucion: z.string(),
    ubicacion: z.string(),
    inicio: mes,
    fin: mes.optional(),
    registro: z.string().optional(),
  }),
});

// Nueve entradas de una línea, sin cuerpo. Nueve archivos sueltos serían nueve
// oportunidades de escribir el frontmatter distinto.
const certificaciones = defineCollection({
  loader: file('./src/content/certificaciones.yaml'),
  schema: z.object({
    id: z.string(),
    nombre: z.string(),
    emisor: z.string().optional(),
    // Varias certificaciones no traen fecha en el CV; exigirla obligaría a
    // inventarla.
    fecha: mes.optional(),
    horas: z.number().int().positive().optional(),
    credencial: z.string().optional(),
    url: z.string().url().optional(),
    tipo: z.enum(['certificacion', 'curso']).default('certificacion'),
  }),
});

export const collections = {
  experiencia,
  proyectos,
  publicaciones,
  educacion,
  certificaciones,
};
