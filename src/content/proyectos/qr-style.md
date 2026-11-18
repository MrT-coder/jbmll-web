---
titulo: QR Style, códigos QR que conservan la imagen del logo
desc: Servicio gratuito que convierte un logo en un QR escaneable que sigue pareciéndose al logo, y que corre entero en el navegador.
estado: construyendo
contexto: personal
fecha: 2026-11
st:
  - TypeScript
  - zxing-wasm
  - Vitest
  - Python
  - Cloudflare
  - GitHub Actions
kw:
  - códigos QR
  - procesamiento de imágenes
  - privacidad
  - Web Worker
demo: https://qrstyle.jbmllnube.com
destacado: false
borrador: false
---

Construí un servicio gratuito que convierte el logo de una persona en un código QR que los teléfonos escanean y que sigue pareciéndose al logo. El usuario elige entre tres estilos y la imagen nunca sale de su dispositivo.

![Interfaz de QR Style en modo oscuro: carga del logo, campo del enlace y selector de los tres estilos de QR](/media/qr-style-interfaz.png "La interfaz: logo, enlace y estilo en tres pasos.")

Puedes probarlo en [qrstyle.jbmllnube.com](https://qrstyle.jbmllnube.com/).

## Tres estilos de QR

Un QR genérico no se parece a nada. Implementé tres formas de integrar el logo. «Tejido» usa el logo completo como fondo y modula solo el centro de cada módulo. «Clásico» dibuja puntos redondos del color del logo, buscadores circulares y el logo sobre una placa central. «Dentro del logo» dibuja un QR pequeño en una zona despejada del logo, con trazos que siguen sus crestas, y deja el resto de la imagen intacta. Que el usuario elija el estilo es una decisión del producto: cada logo se ve mejor con uno distinto.

## Todo en el navegador

Había planeado una API con FastAPI y la descarté. Un logo es material de marca, y un servicio gratuito sin servidor ni base de datos no tiene nada que filtrar ni que mantener. El motor está en TypeScript sobre arreglos tipados, corre en un Web Worker para no congelar la página y se publica como sitio estático en Cloudflare Pages.

## Verificar antes de entregar

Un QR bonito que no escanea no sirve. Cada resultado se decodifica en el propio navegador con zxing-wasm, en varias variantes de la imagen, y los parámetros se ajustan según la URL: el mismo ajuste que funcionó con una dirección falló con otra. Elijo una configuración que pase con margen, no la mínima que pasa. También valido tamaño del logo y longitud de la URL para pedir lo que el escaneo necesita.

## Prototipo en Python como referencia

Validé primero el algoritmo en Python y lo conservé en el repositorio como referencia del motor en TypeScript. Las pruebas con Vitest recorren todos los estilos contra los logos de muestra y los decodifican con zxing.

## Ayudas para imprimir y para el idioma

Agregué una guía de tamaño de impresión, colores personalizados en el estilo clásico con advertencias de contraste, cabeceras de seguridad y un selector de español e inglés con una prueba de paridad entre diccionarios. La política CSP sigue en modo solo reporte hasta revisar el sitio desplegado.

## Pendiente

Falta probar de punta a punta en un navegador real y calibrar los valores de tamaño y densidad con teléfonos reales.
