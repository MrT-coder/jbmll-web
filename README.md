# jbmll.dev

Web personal de Josue Bladimir Morales Llanganate (JBMLL): proyectos, publicaciones y notas, en una terminal
que se navega a comandos o a clic.

Hoy publica una pantalla de «próximamente». El sitio completo se construye
encima de esta misma base.

## Empezar

```sh
npm install
npm run dev      # http://localhost:4321
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | servidor de desarrollo con recarga en caliente |
| `npm run build` | genera `dist/` |
| `npm run verify` | revisa el `dist/` ya generado |
| `npm run ship` | build + verify, lo que corre antes de desplegar |

## Cómo está armado

Astro en modo estático. Cada página se genera en el build y se sirve como HTML
desde el CDN: **en una visita no corre código en ningún servidor**.

```
public/fonts/        FiraCode recortada, servida como archivo
src/data/banner.txt  el banner JBMLL, 6 × 43
src/styles/tokens.css paleta y tipografía
src/layouts/Base.astro cabecera del documento y metadatos
src/components/       la terminal (única isla interactiva)
src/pages/            una página = una URL
scripts/verify.mjs    verificaciones sobre el sitio compilado
```

No hay framework de interfaz. La terminal es un script suelto de unos pocos KB;
traer React para pintar texto en un `div` costaría cien veces eso.

Página completa: **9,9 KB de HTML, 6,8 KB de CSS y 40,5 KB de fuentes.**

## Lo que viene

El sitio real necesita contenido editable sin tocar código. El plan:

- **En el build** — Astro lee el contenido de D1 y genera cada página estática.
- **En cada visita** — no corre nada, salvo `/admin`, la única ruta con
  `export const prerender = false`.
- **Al publicar** — el admin escribe en D1 y dispara una reconstrucción.

Ahí entra `@astrojs/cloudflare`. Hoy no está: el adaptador sirve para renderizar
por petición, y todavía no hay nada que renderizar por petición. Configurar lo
que no se puede probar es adivinar.

### El detalle que hay que saber desde el día uno

**Las conexiones a D1 no existen durante el build.** Cloudflare las conecta solo
cuando tu código corre en producción. En el build hay que leer la base por su
API HTTP con un token; en `/admin`, por la conexión directa. Dos caminos a la
misma base, uno por momento.

Descubrirlo a mitad de camino obliga a reescribir cómo se generan todas las
páginas.

### Autenticación

Cloudflare Access delante de `/admin`. Cero código de login propio — y por lo
tanto, cero posibilidad de escribirlo mal.

## Por qué `verify` existe

Cada comprobación de `scripts/verify.mjs` está ahí porque algo falló de verdad
durante el prototipo, y todas fallan **en silencio**:

- Sin `viewport`, un navegador móvil finge 980 px de ancho y encoge todo. El
  prototipo lo tuvo roto porque dependía del envoltorio de la plataforma donde
  se publicaba; al pasarlo a archivo local, esa muleta desapareció.
- El glifo del prompt vive en el Área de Uso Privado de Unicode: sin la fuente
  empaquetada es un cuadrado vacío en cualquier máquina sin Nerd Font.
- Los espacios al final de línea son parte del banner, y cualquier editor con
  «trim trailing whitespace» los borra.
- CSS no avisa de una variable inexistente: hereda en silencio. Así estuvo roto
  `--peach` durante días sin que nada se rompiera a la vista.

## Referencia

`prototipo/` guarda el prototipo original en un solo HTML, con el lector de
artículos, los paneles TUI y la navegación completa. No forma parte del build;
es de donde se porta cada pieza.

## Licencias

FiraCode Nerd Font Mono y Cascadia Mono, bajo SIL Open Font License 1.1.
