# Prototipo `jbsh`

Home terminal de `jbmll.dev`. Explora el arranque, el prompt de dos líneas, las
sugerencias en lista y la navegación por comandos antes de elegir framework.

## Abrir

Doble clic en `../jbsh.html`. No necesita servidor: todo va embebido en el
archivo, incluidas las fuentes. Funciona sin conexión.

## Reconstruir

```
python build.py
```

Lee `jbsh.template.html`, inyecta las dos fuentes en base64 y el banner de
`jbmll.txt`, y escribe `../jbsh.html`.

Editá **la plantilla**, nunca `jbsh.html` — ese archivo se sobrescribe en cada
build.

## Probar

```
node test-md.mjs
```

Ejercita el renderizador de Markdown contra un DOM mínimo: encabezados,
párrafos, listas, citas, bloques de código, imágenes y formato en línea, más un
pase sobre los artículos reales para confirmar que no queda sintaxis sin
interpretar fuera de los bloques de código.

## Navegación

No hay modos. Hay una sola terminal cuya salida está hecha de enlaces: quien
sabe escribe, quien no, hace clic, y los dos ejecutan el mismo comando y llegan
a la misma URL.

| Destino | Con teclado | Con ratón |
|---|---|---|
| Sección | `cd proyectos` · `z proyectos` · `Alt+2` | pestaña o fila de `ls` |
| Entrada | `cat jbsh` | fila de `ls` |
| Raíz | `cd ~` · `..` | el `…/` del prompt |
| Arranque en frío | `reboot` · `reset` | `jbmll.dev` en la cabecera |

Tocar la marca no hace `cd ~`: hace un **arranque en frío** — vacía el búfer,
reinicia el historial y vuelve a bootear. Es lo que uno espera de volver al
inicio en una terminal, en vez de un `cd` con todo el historial colgando.

Las filas y las pestañas son anclas con `href` real, no `div` con un manejador
de clic. Eso hace que funcionen el clic del medio, «abrir en pestaña nueva», la
navegación por teclado y los rastreadores — y es lo que permite que el mismo
marcado sirva de navegación y de índice para buscadores.

### La home arranca con `ls`

El arranque ejecuta `ls` solo. Un prompt vacío obliga al visitante a adivinar
qué escribir; un listado ya hecho, con cada fila clicable, se explica por sí
mismo aunque nunca haya tocado una terminal.

### Paneles TUI

Dentro de una sección, `ls` no lista en tabla: dibuja un panel por entrada, con
el título encajado en la línea superior del borde — como los paneles de lazygit
o btop. Cada panel es un enlace entero.

El borde se hace con CSS y un fondo que corta la línea, no con caracteres
`┌─┐`. Un dibujo con caracteres exige que cada línea mida exactamente lo mismo,
y se desalinea en cuanto cambia el ancho o el texto envuelve.

### Stack y palabras clave son campos distintos

```js
st: ["TypeScript", "Canvas"]              // tecnologías
kw: ["arquitectura", "SEO"]               // temas
```

`computeStack()` lee **solo** `st`. Si fueran el mismo campo, un artículo
etiquetado «SEO» metería SEO en el Tech Stack, y el stack dejaría de significar
«esto es lo que sé usar».

En los paneles se distinguen a la vista: el stack entre corchetes en cian, las
palabras clave con almohadilla en gris.

### La cabecera

Fila uno, la marca. Fila dos, una barra de ventanas al estilo tmux —
`1:sobre-mi 2:proyectos …` — con la sección activa resaltada y `Alt+número` como
atajo. Se dibuja desde `TREE`: agregar una sección la hace aparecer en la barra,
en `ls` y en los atajos sin tocar nada más.

Cabecera, terminal y statusline comparten la misma columna de 96 caracteres, así
la página se lee como una sola pieza.

## Celular y tablet

Una terminal es una interfaz de teclado, y en un teléfono el teclado no existe
hasta que aparece — y cuando aparece tapa media pantalla. De ahí la regla:

> **El teclado no sube solo. Nunca.**

Solo lo levanta tocar la línea del prompt, que en táctil se marca con un borde
arriba y abajo y dice «tocá acá para escribir». Tocar cualquier otra parte de la
terminal no hace nada — se puede leer y navegar el sitio entero sin que aparezca.

Eso convierte la navegación a dedo en la interfaz principal, no en una
alternativa: pestañas, filas de `ls` y paneles son todos destinos tocables.

| Qué | Cómo se resuelve |
|---|---|
| Objetivos táctiles | ~44 px de alto en pestañas, filas, sugerencias y botones |
| Sin hover | El borde de los paneles se ve siempre, no al pasar por encima |
| Pestañas | Se arrastran de costado; envolverlas empujaría la terminal fuera |
| Banner | Se ata al ancho de pantalla (`2.6vw`), no al de texto |
| Paneles | Una sola columna |
| Banner + panel | Se apilan por debajo de 660 px, sin scroll horizontal |
| Cuerpo | Piso de 13 px: a 12 px la prosa monoespaciada se lee con esfuerzo |

### El teclado tapando la statusline

El teclado virtual encoge el viewport visual, pero `dvh` no siempre lo refleja:
la statusline y el prompt quedan debajo del teclado justo mientras se escribe.

Se resuelve con un token `--vh` que `visualViewport` actualiza en cada cambio de
tamaño. `body` usa `height: var(--vh)`, así que la ventana sigue el alto real.

### Un solo punto de corte

660 px para todo lo que depende del ancho, y `(hover:none) and (pointer:coarse)`
para lo que depende del dedo. Son dos preguntas distintas — «¿entra?» y «¿lo
tocan?» — y mezclarlas lleva a una tablet con ratón tratada como teléfono.

## El lector

Un artículo no se vuelca al stream con `cat`: se abre en un pager, como `less`
o `glow`. `cat <entrada>` cambia el modo de la statusline a `LECTOR` y muestra
el texto acotado a 64 columnas.

| Tecla | Qué hace |
|---|---|
| `q` · `Esc` | salir |
| espacio · `PageDown` | avanzar una pantalla |
| `j` · `k` | bajar · subir |
| `gg` · `G` | principio · final |

`gg` son dos pulsaciones dentro de 600 ms, como en vim: la `g` sola no hace
nada.

El artículo cierra con un bloque `(END)` — el marcador con que `less` termina un
búfer — que ofrece volver arriba, salir a la sección y saltar a la entrada
siguiente. Cada botón lleva su tecla escrita al lado: se usa con el ratón y de
paso se aprende el atajo.

Pasado el 55 % aparece además un botón flotante abajo a la derecha. Antes de esa
altura volver arriba no cuesta nada y el botón sería un estorbo permanente.

La medida acotada no es estética: la prosa monoespaciada se vuelve difícil
cuando el renglón mide doscientos caracteres, no por la fuente.

### Markdown a nodos, nunca a HTML

`renderMd` construye nodos del DOM con `createElement` y `createTextNode`. No
hay una sola llamada a `innerHTML` en todo el archivo. Cuando el cuerpo de los
artículos venga de la base y se edite desde el panel, ese cuerpo es exactamente
el vector por donde entraría un XSS — y así el agujero no llega a existir.

## Las fuentes

Recortadas desde las que ya están instaladas en el sistema, en
`%LOCALAPPDATA%\Microsoft\Windows\Fonts\` y `C:\Windows\Fonts\`.

| Archivo | Origen | Tamaño | Para qué |
|---|---|---|---|
| `jb-Regular.woff2` | FiraCode Nerd Font Mono Regular | 20 KB | todo |
| `jb-Bold.woff2` | FiraCode Nerd Font Mono Bold | 21 KB | énfasis |

Bajo SIL Open Font License 1.1, que permite empaquetarlas en un sitio web. La
atribución va en el footer del sitio real.

`jb-braille.woff2` y `braille.txt` quedan en la carpeta pero **ya no se
embeben**: el logo braille de fastfetch fue reemplazado por el banner JBMLL.
Se conservan por si vuelve.

### El banner

`jbmll.txt` — «JBMLL» en bloques, 6 × 43. Usa U+2588 y box-drawing doble
(U+2550–U+255D), que FiraCode sí trae; se verificó sobre el recorte, no se
asumió.

`build.py` **rellena cada línea al ancho máximo** antes de inyectarla. Los
espacios finales son parte del dibujo y cualquier editor con «trim trailing
whitespace» los borra sin avisar; rellenar al vuelo hace que el banner
sobreviva a esa edición en vez de romperse en silencio.

Se generó con un script que valida que cada letra tenga todas sus filas del
mismo ancho antes de concatenarlas — una letra desalineada corre todo lo que
viene después.

### La lección del braille

FiraCode Nerd Font **no incluye el bloque braille** (U+2800–U+28FF). En Windows
Terminal ese logo se dibujaba con Cascadia por un fallback silencioso del
sistema, no con la fuente configurada. En la web ese rescate no existe: hubiera
sido una pared de cuadrados vacíos.

De ahí la regla: **verificar que la fuente tenga el glifo antes de usarlo**, no
asumirlo porque se ve bien en la terminal propia.

### Regenerar los recortes

```sh
FONTS="$LOCALAPPDATA/Microsoft/Windows/Fonts"
GLYPHS="U+0020-007E,U+00A0-00FF,U+2026,U+2018-201F,U+2190-2199,\
U+2500-257F,U+2580-259F,U+25A0-25FF,U+2800-28FF,U+EE9C"

for w in Regular Bold; do
  pyftsubset "$FONTS/FiraCodeNerdFontMono-$w.ttf" \
    --unicodes="$GLYPHS" \
    --layout-features="+calt,+liga" \
    --flavor=woff2 --output-file="jb-$w.woff2"
done

pyftsubset "C:/Windows/Fonts/CascadiaMono.ttf" \
  --unicodes-file=braille.txt \
  --flavor=woff2 --output-file=jb-braille.woff2
```

`braille.txt` lista los 83 caracteres que usa el logo, uno por línea en formato
`U+XXXX`. Se regenera con:

```py
import io
s = io.open('~/.config/fastfetch/ascii.txt', encoding='utf-8').read()
cps = sorted({ord(c) for c in s if 0x2800 <= ord(c) <= 0x28FF})
open('braille.txt', 'w').write(','.join('U+%04X' % c for c in cps))
```

`+calt,+liga` no es opcional: el `-> ` que starship usa antes de la rama de git
depende de las ligaduras de FiraCode. Sin ellas se ve como dos caracteres
sueltos en vez de una flecha.

## Glifos del prompt

| Codepoint | Dónde | En la web |
|---|---|---|
| `U+EE9C` | `starship.toml:82,83` — cerebro, verde en éxito y rojo en error | sí |
| `U+EE9C` | `starship.toml:91` — `[username]`, config muerta: `$username` no está en `format` | no |
| `U+F0219` | `starship.toml:106` — ícono de `Documents`, sustitución local | no |
| `U+2026` | truncado de rutas (`…/`) | sí |

`U+EE9C` está en el Área de Uso Privado de Unicode. Ninguna fuente de sistema lo
trae: fuera de la Nerd Font empaquetada se ve como un cuadrado vacío.

## Qué es real y qué es andamio

Reales: la paleta (esquema `GENTLEMAN` de Windows Terminal), las fuentes, el
glifo del cerebro, el logo, los alias (`ll`, `c`, `..`, `g`) y los proyectos
`jbsh` y `dotfiles`.

Andamio: las entradas marcadas con `ph: true` en `TREE`, que se muestran
atenuadas y con un guion en lugar de nombre. Se borran cuando entre el contenido
real.
