---
titulo: PeWoNu, bienestar para astronautas en misiones largas
desc: Prototipo del NASA Space Apps Challenge 2026 que compara a cada astronauta con su propia línea base y comparte con la base en Tierra solo lo que él decide enviar.
estado: prueba-de-concepto
organizacion: NASA Space Apps Challenge 2026
fecha: 2026-11
destacado: true
st:
  - Python
  - Flet
  - FastAPI
  - SQLite
  - GitHub Actions
kw:
  - salud de astronautas
  - línea base personal
  - HL7 FHIR
  - sin conexión
  - bilingüe
  - hackatón
repo: https://github.com/MrT-coder/pewonu
demo: https://pewonu.jbmllnube.com/
---
Lideré un equipo de cinco personas en un hackatón de dos días, el 14 y 15 de noviembre de 2026, para el reto «Create Health Monitoring Software for Astronauts on Space Missions» del NASA Space Apps Challenge. Construimos un prototipo de dos sistemas: una app para el astronauta y una base en Tierra. Todos los datos son simulados y el prototipo no diagnostica.

![App del astronauta: figura corporal coloreada por el estado de cada sistema, anillo de misión y panel de datos](/media/pewonu-app.jpg "La app del astronauta, con la tripulación ficticia del escenario simulado.")

## Comparar a cada persona con su propia línea base

Cada astronauta se compara con su propio historial, no con un promedio poblacional. Cada sistema del cuerpo se colorea según esa línea base y pasa a gris cuando no hay datos suficientes para opinar: un gris honesto es mejor que un verde que el sistema no puede sostener. En la ruta de alertas no hay ningún modelo de IA; las reglas son deterministas y se explican en lenguaje llano.

## Compartir solo lo que el astronauta confirma

Nada sale del astronauta sin su confirmación. Lo que elige enviar se empaqueta como un Bundle HL7 FHIR R4, que contrastamos con el validador oficial de HL7. La base en Tierra, hecha con FastAPI y SQLite, lo valida y lo muestra solo tras un retraso de comunicación simulado (12 minutos por defecto, configurable de 0 a 22), para que la interfaz refleje la distancia en lugar de fingir tiempo real.

![Base en Tierra: tripulantes, qué requiere atención y paquetes recibidos](/media/pewonu-base-tierra.jpg "La base en Tierra solo ve lo que la tripulación decidió enviar.")

## Funcionar sin internet

La app corre con Flet y un servidor local, con los datos en SQLite en el mismo equipo. Una prueba del 14 de noviembre mostró que el modo sin red solo funciona con la opción `no_cdn=True`; sin ella la interfaz no se dibuja. Por eso, una vez instalado, el sistema no depende de una conexión. Se instala con un solo comando, que la página del proyecto explica para Windows, macOS y Linux.

## Una voz que no se conserva

El registro de voz es opcional: el audio se descarta en el dispositivo y solo se guardan medidas acústicas numéricas. No se infiere ninguna emoción.

## Resultado

En la sede local no ganamos, pero participamos y salimos de nuestra zona de confort. El resultado a nivel mundial aún no se publica. Quedaron pendientes los recordatorios de rutina, la pantalla de emergencia, la racha de adherencia y guardar el registro de comidas en la base de datos, que hoy vive en memoria. El uso de IA en el proyecto está declarado en el README del repositorio.

![Certificado Galactic Problem Solver del NASA Space Apps Challenge 2026, emitido a Josue Bladimir Morales Llanganate](/media/nasa-space-apps-2026-certificado.png "Certificado de participación, 14 y 15 de noviembre de 2026.")

Hay una [presentación de 7 diapositivas](/media/pewonu-presentacion.pdf) con el resumen del proyecto.
