// Decide, antes del primer pintado, si esta carga anima su pantalla.
//
// Es un guion clásico y aparte, no parte de terminal.ts, por el orden de
// ejecución: los módulos corren diferidos, cuando la página ya pudo pintarse.
// Si la decisión viviera allá, el contenido se vería entero, desaparecería y
// recién entonces se animaría. Este archivo se carga bloqueante, justo antes del
// contenido (ver Terminal.astro), y pone una clase en <html> antes de que ese
// contenido se pinte. terminal.ts la quita al terminar.
//
// No es un guion en línea porque la CSP del sitio (script-src 'self') no los
// admite; por eso es un archivo, y por eso es JS plano y no un .ts.
//
// Dos modos, que fija la etiqueta (data-modo, ver Terminal.astro):
//   · arranque (el inicio): `arranque` en <html> en cada carga completa de «/»,
//     recarga incluida. Antes era solo la primera visita de la sesión (lo
//     recordaba sessionStorage); el dueño del sitio lo revirtió el 2026-10-07 y
//     ya nada lo recuerda. Volver al inicio sin recargar lo arma reiniciar().
//   · entrada (cualquier otra página): `entrada` en <html>, solo si la persona
//     llegó desde dentro del sitio. Es el mismo `cd` que se ve al navegar sin
//     recargar, para las páginas que el servidor entrega completas (sobre-mi,
//     contacto, detalles, 404…) y que navegar() no puede animar desde el cliente.
//
// Sin la clase todo se ve entero y de inmediato: prefers-reduced-motion,
// llegada directa o externa (entrada) o sin JavaScript.
(function () {
  var raiz = document.documentElement;
  var script = document.currentScript;
  var modo = script ? script.getAttribute('data-modo') : null;
  var clase;
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (modo === 'arranque') {
      clase = 'arranque';
    } else if (modo === 'entrada') {
      // Se decide por el referente y no por una marca puesta al hacer clic:
      // el navegador lo envía solo, en cualquier forma de llegar (clic, teclado,
      // clic del medio, irFuera() de terminal.ts), sin un oyente que cubra cada
      // enlace ni un almacenamiento que pueda estar bloqueado. Una visita directa,
      // desde un buscador o desde otro sitio no trae un referente propio.
      // Recargar y atrás/adelante conservan el referente, pero no son una
      // navegación nueva: no se vuelve a representar el `cd`.
      var nav = performance.getEntriesByType('navigation')[0];
      if (nav && nav.type !== 'navigate') return;
      if (!document.referrer) return;
      if (new URL(document.referrer).origin !== location.origin) return;
      clase = 'entrada';
    } else {
      return;
    }
  } catch (e) {
    return;
  }
  raiz.classList.add(clase);
  // Plazo: si terminal.ts no llega a correr (error, red lenta, módulo
  // bloqueado), el contenido no puede quedar oculto. Su animación dura bastante
  // menos que esto y quita la clase por su cuenta.
  setTimeout(function () {
    raiz.classList.remove(clase);
  }, 4000);
})();
