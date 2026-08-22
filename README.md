# jbmll.dev

Web personal de **Josue Bladimir Morales Llanganate** (JBMLL): proyectos,
publicaciones y notas, en una terminal que se navega con comandos o con clic.

Hoy publica una pantalla de «próximamente». El sitio completo se construye
sobre esta misma base.

## Empezar

```sh
npm install
npm run dev
```

Disponible en `http://localhost:4321`.

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | servidor de desarrollo con recarga en caliente |
| `npm run build` | genera `dist/` |
| `npm run verify` | revisa el `dist/` ya generado |
| `npm run ship` | build + verify; lo que se ejecuta antes de desplegar |

Requiere Node 22 (ver `.nvmrc`).

## Arquitectura

Astro en modo estático. Cada página se genera durante la compilación y se sirve
como HTML desde el CDN: **en una visita no se ejecuta código en ningún
servidor**.

```
public/fonts/           Fira Code recortada, servida como archivo
src/data/banner.txt     el banner JBMLL, 6 × 43
src/styles/tokens.css   paleta y tipografía
src/styles/terminal.css estilos de los elementos que crea el script
src/layouts/            cabecera del documento y metadatos
src/components/         la terminal, única isla interactiva
src/pages/              un archivo aquí es una URL
scripts/verify.mjs      verificaciones sobre el sitio compilado
```

No se usa framework de interfaz. La terminal es un script suelto de unos pocos
kilobytes; incorporar una biblioteca de componentes para escribir texto en un
`div` costaría un orden de magnitud más.

Peso de la página completa: **10 KB de HTML, 6 KB de CSS y 41 KB de fuentes.**

### Identidad visual

Nada de la apariencia se eligió para este sitio: todo proviene de la
configuración de terminal que el autor ya usaba.

- La paleta es el esquema `GENTLEMAN` de Windows Terminal, valor por valor.
- El prompt de dos líneas replica la configuración de `starship`.
- El glifo del prompt cambia de verde a rojo según el resultado del último
  comando, igual que `success_symbol` y `error_symbol` en esa configuración.

Ese glifo vive en el Área de Uso Privado de Unicode: existe solo porque hay una
Nerd Font instalada. De ahí que el sitio empaquete su propia fuente recortada;
sin ella sería un cuadrado vacío en cualquier equipo ajeno.

## Hoja de ruta

El sitio necesita contenido editable sin tocar código. El plan:

- **Durante la compilación** — Astro lee el contenido de D1 y genera cada
  página como HTML estático.
- **En cada visita** — no se ejecuta nada, salvo en `/admin`, la única ruta
  marcada con `export const prerender = false`.
- **Al publicar** — el panel escribe en D1 y dispara una reconstrucción.

Ahí entra `@astrojs/cloudflare`. Todavía no está instalado: el adaptador sirve
para renderizar por petición y aún no hay ninguna ruta que lo necesite.

La autenticación de `/admin` será Cloudflare Access. Sin código de inicio de
sesión propio y, por lo tanto, sin posibilidad de escribirlo mal.

### Un detalle a tener presente

**Las conexiones a D1 no existen durante la compilación.** Cloudflare las provee
solo cuando el código corre en producción. Durante el build hay que consultar la
base por su API HTTP con un token; en `/admin`, por la conexión directa. Dos
caminos a la misma base, uno para cada momento.

## Por qué existe `verify`

Cada comprobación de `scripts/verify.mjs` está ahí por un fallo real, y todos
tenían algo en común: **fallaban en silencio**. La página se veía casi bien y
nada avisaba.

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

`prototipo/` conserva el prototipo original en un solo archivo HTML, con el
lector de artículos, los paneles de estilo TUI y la navegación completa. No
forma parte de la compilación: es la referencia de la que se porta cada pieza.

## Licencias

El **código** está bajo licencia MIT. Ver [`LICENSE`](LICENSE).

El **contenido editorial y la identidad personal** —textos, artículos,
publicaciones, el banner y el nombre del autor— son © 2026 Josue Bladimir
Morales Llanganate, con todos los derechos reservados.

Las **fuentes** incluidas están bajo SIL Open Font License 1.1. Ver
[`public/fonts/LICENSE.md`](public/fonts/LICENSE.md).
