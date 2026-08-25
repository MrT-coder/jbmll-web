// Iconos de tecnologías, como caracteres de fuente.
//
// La Nerd Font que el sitio ya empaqueta trae los logos en el Área de Uso
// Privado. Usarlos como texto en vez de imágenes evita 29 archivos, no toca
// `img-src` de la política de seguridad, escala sin perder nitidez y hereda el
// color del texto — que es lo que hace que encajen en una terminal en lugar de
// pelearse con ella.
//
// Van como escape y no crudos: crudos son invisibles en el editor.
//
// TODOS los codepoints están verificados contra la fuente instalada leyendo su
// tabla cmap por nombre de glifo. Adivinarlos produce cuadrados vacíos o, peor,
// el logo de otra empresa.

/** Lo que se usa cuando una tecnología no tiene logo propio en la fuente. */
export const ICONO_GENERICO = '\uEB29'; // nf-cod-package

const ICONOS: Record<string, string> = {
  java: '\uE738', // nf-dev-java
  javascript: '\uE74E', // nf-dev-javascript_alt
  typescript: '\uE8CA', // nf-dev-typescript
  python: '\uE73C', // nf-dev-python
  php: '\uE73D', // nf-dev-php
  laravel: '\uE73F', // nf-dev-laravel
  react: '\uE7BA', // nf-dev-react
  'vue.js': '\uE8DC', // nf-dev-vuejs
  docker: '\uE7B0', // nf-dev-docker
  postgresql: '\uE76E', // nf-dev-postgresql
  mysql: '\uE704', // nf-dev-mysql
  cloudflare: '\uE792', // nf-dev-cloudflare
  'tailwind css': '\uE8BA', // nf-dev-tailwindcss
  supabase: '\uE8B6', // nf-dev-supabase
  opencv: '\uE854', // nf-dev-opencv
  'tensorflow lite': '\uE8BC', // nf-dev-tensorflow
  'ren\'py': '\uE88D', // nf-dev-renpy
  'spring boot': '\uE8AC', // nf-dev-spring
  'spring ai': '\uE8AC', // nf-dev-spring
  vitest: '\uE8D6', // nf-dev-vite, porque Vitest corre sobre Vite
  'github actions': '\uEAFF', // nf-cod-github_action
  pest: '\uEE70', // nf-fa-mortar_pestle, que es literalmente su logo
};

/** El icono de una tecnología. Nunca falla: sin logo propio, va el genérico. */
export function iconoDe(tech: string): string {
  return ICONOS[tech.toLowerCase()] ?? ICONO_GENERICO;
}

/** Todos los caracteres que hay que incluir al recortar la fuente. */
export function glifosUsados(): string[] {
  return [...new Set([...Object.values(ICONOS), ICONO_GENERICO])];
}
