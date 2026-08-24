# JBMLL-WEB

Esta es mi web personal, inspirada en una terminal simple y sencilla. Aquí
reúno mis proyectos, mis publicaciones y mis notas, y se navega con comandos o
con clic — como cada quien prefiera.

Las cuatro secciones ya están en pie y el contenido es real. Falta llevarlo a
una base de datos y montar el panel desde el que se edita; hasta entonces vive
en archivos, detrás de la misma puerta que usará después.

## Empezar

```sh
npm install
npm run dev
```

Queda disponible en `http://localhost:4321`.

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | servidor de desarrollo con recarga en caliente |
| `npm run build` | genera `dist/` |
| `npm run verify` | revisa el `dist/` ya generado |
| `npm run ship` | build + verify; lo que ejecuto antes de desplegar |

Necesita Node 22 (ver `.nvmrc`).

## Cómo está armado

Astro en modo estático. Cada página se genera durante la compilación y se sirve
como HTML desde el CDN: **en una visita no se ejecuta código en ningún
servidor**.

```
public/fonts/           Fira Code recortada, servida como archivo
src/data/banner.txt     el banner JBMLL, 6 × 43
src/styles/tokens.css   paleta y tipografía
src/styles/terminal.css estilos de lo que no recibe alcance de componente
src/styles/reader.css   el lector: ritmo vertical y jerarquía sin color
src/content.config.ts   la forma del contenido, validada al compilar
src/content/            el contenido: experiencia, proyectos, publicaciones…
src/data/perfil.ts      quién soy y dónde encontrarme
src/lib/content.ts      la única puerta a los datos
src/lib/render.ts       de datos a HTML, sin tocar el DOM
src/layouts/            cabecera del documento y metadatos
src/components/         la terminal, mi única isla interactiva
src/pages/              un archivo aquí es una URL
scripts/verify.mjs      verificaciones sobre el sitio compilado
```

El sitio vive en **jbmllnube.com**. Ese dominio está en `astro.config.mjs` y de
ahí salen la etiqueta canónica, las etiquetas para compartir y el sitemap.

No uso framework de interfaz. La terminal es un script suelto de unos pocos
kilobytes; traer una biblioteca de componentes para escribir texto en un `div`
me costaría un orden de magnitud más.

Peso de la página completa: **10 KB de HTML, 6 KB de CSS y 41 KB de fuentes.**

### De dónde sale la apariencia

Nada de esto lo elegí para el sitio: todo viene de la configuración de terminal
que ya venía usando.

- La paleta es mi esquema `GENTLEMAN` de Windows Terminal, valor por valor.
- El prompt de dos líneas replica mi configuración de `starship`.
- El glifo del prompt cambia de verde a rojo según cómo haya salido el último
  comando, igual que `success_symbol` y `error_symbol` en esa configuración.

Ese glifo vive en el Área de Uso Privado de Unicode: existe solo porque tengo
una Nerd Font instalada. Por eso el sitio empaqueta su propia fuente recortada;
sin ella sería un cuadrado vacío en cualquier equipo que no sea el mío.

## Hacia dónde va

Quiero poder publicar sin tocar código. El plan:

- **Durante la compilación** — Astro lee el contenido de D1 y genera cada
  página como HTML estático.
- **En cada visita** — no se ejecuta nada, salvo en `/admin`, la única ruta
  marcada con `export const prerender = false`.
- **Al publicar** — el panel escribe en D1 y dispara una reconstrucción.

Ahí entra `@astrojs/cloudflare`. Todavía no lo instalo: el adaptador sirve para
renderizar por petición y aún no tengo ninguna ruta que lo necesite.

Para entrar a `/admin` voy a usar Cloudflare Access. Sin código de inicio de
sesión propio y, por lo tanto, sin posibilidad de escribirlo mal.

### Un detalle que conviene saber

**Las conexiones a D1 no existen durante la compilación.** Cloudflare las provee
solo cuando el código corre en producción. Durante el build hay que consultar la
base por su API HTTP con un token; en `/admin`, por la conexión directa. Dos
caminos a la misma base, uno para cada momento.

## Dos decisiones que explican el resto

**El stack no se escribe, se cuenta.** Cada trabajo y cada proyecto declara qué
tecnologías usó, y la lista sale de sumarlas. Una tecnología sin ninguna entrada
que la respalde no aparece por ningún lado: no hay dónde inflarla. Cuando dos
entradas describen el mismo trabajo —mi puesto por cuenta propia y el proyecto
que hice en él— solo una declara el stack, o contaría doble sin que nadie
mintiera.

**El lector no se renderiza en el navegador.** Abrir un artículo lleva a su URL,
y esa página la genera Astro con el Markdown ya procesado. Se pierde la
navegación sin recarga al entrar a un artículo; se gana no enviar un analizador
de Markdown a cada visita, y que el cuerpo del texto sea legible para quien
llegue sin JavaScript.

## Por qué existe `verify`

Cada comprobación de `scripts/verify.mjs` está ahí por un fallo que tuve de
verdad, y todos tenían algo en común: **fallaban en silencio**. La página se
veía casi bien y nada avisaba.

- **Sin `viewport`**, un navegador móvil supone un ancho de 980 px y reduce todo
  a escala. Ninguna consulta de medios ve el ancho real.
- **Los estilos de un archivo `.astro` tienen alcance de componente.** Astro
  marca los elementos de la plantilla y limita el CSS a esa marca; los elementos
  que crea el script en tiempo de ejecución nunca la reciben. Por eso los
  estilos de la salida de la terminal viven en un `.css` aparte.
- **Una variable CSS inexistente no produce error**: se hereda en silencio y el
  color queda mal sin que nada se rompa.
- **Astro recorta el espacio al final de línea** en las plantillas: un salto de
  línea junto a una etiqueta une las palabras.
- **Los espacios al final de línea son parte del banner** y cualquier editor con
  «recortar espacios finales» los borra.

## Referencia

En `prototipo/` guardo el prototipo original, en un solo archivo HTML, con el
lector de artículos, los paneles de estilo TUI y la navegación completa. No
forma parte de la compilación: es de donde voy portando cada pieza.

## Licencias

El **código** está bajo licencia MIT. Ver [`LICENSE`](LICENSE).

El **contenido y mi identidad** —textos, artículos, publicaciones, el banner y
mi nombre— son © 2026 Josue Bladimir Morales Llanganate, con todos los derechos
reservados.

Las **fuentes** incluidas están bajo SIL Open Font License 1.1. Ver
[`public/fonts/LICENSE.md`](public/fonts/LICENSE.md).
