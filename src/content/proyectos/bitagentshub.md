---
titulo: BitAgentsHub, una oficina en pixel art dentro de la terminal para tus agentes de Claude Code
desc: Aplicación de terminal en la que cada agente de Claude Code en ejecución es un personaje en su escritorio, con sus terminales reales, su gasto de tokens y los límites del plan.
estado: construyendo
contexto: personal
fecha: 2026-10
st:
  - Go
  - GitHub Actions
kw:
  - terminal
  - agentes de IA
  - pseudoterminal
  - proceso en segundo plano
  - código abierto
repo: https://github.com/MrT-coder/bitagentshub
destacado: false
borrador: false
---

Construí una aplicación de terminal en la que cada agente de Claude Code en ejecución es un personaje en su escritorio: se ve quién trabaja, quién piensa y quién espera, se abre la terminal de cualquiera en una ventana y se sigue su gasto de tokens y los límites del plan. Todo se lee de archivos locales y no se envía nada a ningún lado. Es un solo binario, `bah`, para Windows, macOS y Linux, con licencia MIT.

![Banner de BitAgentsHub: una oficina en pixel art verde con agentes frente a sus escritorios y un gato en una esquina](/media/bitagentshub-oficina.webp "BitAgentsHub: una oficina en la terminal, un escritorio por agente.")

## Un proceso en segundo plano dueño de las terminales

Las pseudoterminales no las posee la ventana de la oficina sino un proceso aparte. Así, cerrar la oficina, perder una conexión SSH o recompilar el ejecutable no mata a los agentes que corren. Escucha solo en una tubería (un socket fuera de Windows) que únicamente abre el mismo usuario, y se apaga solo cuando no queda ninguna oficina conectada ni programa en marcha.

## Terminales reales en cada ventana

Cada panel es una terminal de verdad (ConPTY en Windows) dibujada con `charmbracelet/x/vt`, y cada tecla llega al panel enfocado tal cual se escribió, sea Claude Code, Codex, `nvim` o una shell. Las acciones de la ventana van detrás de un prefijo, `ctrl+a`, igual que en herdr y tmux, para que los programas conserven sus teclas.

## Dibujo con medios bloques

La oficina se dibuja con caracteres de medio bloque, porque los paneles de herdr solo dejan pasar gráficos Kitty y estos no existen en Windows Terminal. Así funciona en cualquier terminal con color verdadero. Escribir los códigos de color solo cuando el color cambia y dibujar el fondo una vez por disposición abarató cada cuadro unas 2,5 veces, según el registro de cambios.

## Un reloj de supervisión y una mascota

Quien supervisa agentes rara vez para. Agregué un reloj que cuenta el tiempo de supervisión, con más peso cuantos más agentes trabajan: a los 50 minutos sugiere una pausa y a los 90 pide confirmación antes de enviar otro prompt. La mascota de la esquina se cansa con él y come un pez por cada tarea marcada en el tablero.

## Publicación con versiones

Cada etiqueta de git dispara una publicación con GoReleaser: corren las pruebas y salen binarios para tres sistemas en amd64 y arm64, con sumas de verificación. `bah upgrade` se actualiza contra esas sumas. Hay 63 archivos de prueba, y `go vet` y `go test` corren en cada cambio.

## Pendiente

Solo lo he usado y probado a diario en Windows con Claude Code. En macOS y Linux compila y sus pruebas pasan, pero falta usarlo. Otros agentes funcionan en parte: Codex arranca, pero los escritorios, estados y gasto salen solo de las transcripciones de Claude Code. El ajuste para terminales angostas, como las de un teléfono, sigue en una rama.
