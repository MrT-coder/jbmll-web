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

/**
 * Un campo opcional que además acepta como «no hay dato» lo que el panel
 * escribe cuando se deja en blanco: `''` en un texto y `null` en un número.
 *
 * El panel no omite la clave: la guarda vacía. Un `url: ''` llegaba al esquema
 * como una URL inválida y un `horas: null` como un objeto, y rompían la
 * construcción, y como el verificador corre en el build de Cloudflare, eso bloqueaba la
 * publicación de todo lo demás que sí estaba bien. Para el sitio, vacío y
 * ausente significan lo mismo, así que se normalizan antes de validar en vez
 * de pedirle a quien edita que recuerde borrar la clave a mano.
 */
const opcional = <T extends z.ZodTypeAny>(esquema: T) =>
  z.preprocess((v) => (v === '' || v === null ? undefined : v), esquema.optional());

const experiencia = defineCollection({
  loader: base('experiencia'),
  schema: z.object({
    puesto: z.string(),
    organizacion: z.string(),
    ubicacion: z.string(),
    modalidad: opcional(z.enum(['presencial', 'remoto', 'híbrido'])),
    inicio: mes,
    // Ausente significa «hasta hoy». Un valor centinela obligaría a recordar
    // cuál es, y tarde o temprano alguien lo compara con una fecha real.
    fin: opcional(mes),

    // Un puesto cuyo trabajo ya está descrito como proyecto no declara stack:
    // lo hereda de ahí. Si declarara el suyo, cada tecnología contaría dos
    // veces y el stack quedaría inflado sin que nadie mintiera.
    proyecto: opcional(z.string()),
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
    organizacion: opcional(z.string()),
    fecha: mes,

    // Sin stack, un proyecto no aporta nada al cálculo y es justo lo que el
    // sitio promete mostrar. Se exige al menos uno.
    st: z.array(z.string()).min(1),
    kw: z.array(z.string()).default([]),

    repo: opcional(z.url()),
    demo: opcional(z.url()),
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
    serie: opcional(z.string()),
    editorial: opcional(z.string()),
    paginas: opcional(z.string()),
    doi: opcional(z.string()),
    url: opcional(z.url()),

    // El trabajo que dio origen al artículo. Igual que en experiencia, el
    // stack se hereda de ahí y no se vuelve a contar.
    proyecto: opcional(z.string()),
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
    fin: opcional(mes),
    registro: opcional(z.string()),
  }),
});

// Las páginas: sobre-mí y contacto. Su prosa se escribe en Markdown y sus
// bloques de datos los arma el sitio. Separarlos deja escribir libre lo que es
// libre, sin poder desincronizar lo que se calcula.
const paginas = defineCollection({
  loader: base('paginas'),
  schema: z.object({
    titulo: z.string(),
    desc: z.string(),
  }),
});

// Nueve entradas de una línea, sin cuerpo. Nueve archivos sueltos serían nueve
// oportunidades de escribir el frontmatter distinto.
const certificaciones = defineCollection({
  loader: file('./src/content/certificaciones.yaml'),
  schema: z.object({
    id: z.string(),
    nombre: z.string(),
    emisor: opcional(z.string()),
    // Varias certificaciones no traen fecha en el CV; exigirla obligaría a
    // inventarla.
    fecha: opcional(mes),
    horas: opcional(z.number().int().positive()),
    credencial: opcional(z.string()),
    url: opcional(z.url()),
    tipo: z.enum(['certificacion', 'curso']).default('certificacion'),

    // El archivo que sube el CMS (casi siempre un PDF): el visor flotante lo
    // abre sin salir de la página (ver Visor.astro/src/scripts/visor.ts).
    // `startsWith('/media/')` es el mismo candado que ya usa `foto` en
    // `perfil`, más abajo: es el único `public_folder` que sirve el CMS (ver
    // public/admin/config.yml), así que una ruta pegada a mano no pasa el
    // esquema. La extensión decide, en el visor, si el archivo se incrusta
    // como <object> (PDF) o como <img> (imagen); no se exige aquí ningún
    // carácter «seguro» en el nombre — un espacio u otro carácter del archivo
    // real que suba el dueño se codifica al renderizar (rutaMedia(), en
    // src/lib/render.ts), no al guardar el dato.
    archivo: opcional(
      z
        .string()
        .startsWith('/media/', 'Debe empezar con /media/')
        .regex(/\.(pdf|png|jpe?g|webp|avif)$/i, 'Debe terminar en .pdf, .png, .jpg, .jpeg, .webp o .avif'),
    ),
  }),
});

// El perfil es único y no se lista, así que el YAML trae una sola clave de
// nivel superior («perfil») en vez de una lista con id. El loader `file()`
// trata un objeto (no un arreglo) como un mapa id → datos: cada clave de
// nivel superior se vuelve una entrada, así que esto da exactamente una
// entrada con id «perfil» — confirmado en
// node_modules/astro/dist/content/loaders/file.js (rama `typeof data ===
// 'object'`, línea ~78: `Object.entries(data)` y `store.set({ id, data:
// parsedData, ... })` por cada clave).
const perfil = defineCollection({
  loader: file('./src/content/perfil.yaml'),
  schema: z.object({
    nombre: z.string(),
    marca: z.string(),
    titular: z.string(),
    ubicacion: z.string(),
    disponibilidad: z.string(),
    correo: z.email(),
    // E.164: el signo más y de 6 a 15 dígitos, sin separadores. Es lo que
    // espera wa.me y lo que evita que el enlace y el número visible se
    // separen (ver telefonoLegible() en src/data/perfil.ts).
    telefono: z.string().regex(/^\+\d{6,15}$/, 'Formato E.164, por ejemplo +593958774749'),
    github: z.string(),
    linkedin: z.string(),
    orcid: z.string().regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/, 'Formato ORCID, por ejemplo 0009-0004-2687-2314'),

    // Opcional: sin ella, el bloque de arranque de la portada cae al banner
    // ASCII (ver Terminal.astro). `src` vive bajo /media/, que es el único
    // `public_folder` que sirve el CMS (ver public/admin/config.yml) — así un
    // valor pegado desde otra ruta no pasa el esquema.
    foto: opcional(
      z.object({
        src: z.string().startsWith('/media/', 'Debe empezar con /media/'),
        alt: z.string().min(1, 'El alt no puede quedar vacío'),
      }),
    ),
  }),
});

export const collections = {
  paginas,
  experiencia,
  proyectos,
  publicaciones,
  educacion,
  certificaciones,
  perfil,
};
