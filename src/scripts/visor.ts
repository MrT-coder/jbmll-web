// El visor: intercepta el clic en un enlace [ver] y abre el archivo de la
// certificación en el panel flotante de Visor.astro, en vez de dejar que el
// enlace navegue a él.
//
// Usa el <dialog> nativo (showModal()) a propósito: da gratis el atrapado de
// foco, el cierre con la tecla de salida del teclado y la devolución del foco
// a quien lo abrió. Reimplementar cualquiera de los tres a mano es
// exactamente cómo se cuelan los bugs de accesibilidad que el elemento ya
// resuelve — este módulo no escucha ninguna tecla ni gestiona el foco por su
// cuenta en ningún punto.
//
// El navegador no deja rediseñar su propia barra de herramientas de PDF (el
// toolbar de Chromium, el visor pdf.js de Firefox): los parámetros de
// apertura del PDF (#toolbar=0&navpanes=0&view=FitH) solo atenúan lo que
// Chromium respeta — Firefox puede ignorarlos— así que el marco que sí se
// controla (borde, barra de título, pie) es el que lleva la estética.

const visor = document.getElementById('visor');
const titulo = document.getElementById('visor-titulo');
const cuerpo = document.getElementById('visor-cuerpo');
const botonCerrar = document.getElementById('visor-cerrar');

// Sin este andamiaje no hay panel que gobernar. Fallar acá es mejor que
// quedar respondiendo a medias.
if (!(visor instanceof HTMLDialogElement) || !titulo || !cuerpo || !botonCerrar) {
  throw new Error('visor: falta el andamiaje del documento');
}

const ES_PDF = /\.pdf(?:[?#]|$)/i;
const ES_IMAGEN = /\.(png|jpe?g|webp|avif)(?:[?#]|$)/i;

/**
 * El contenido del panel, según la extensión del archivo. `null` cuando la
 * extensión no es ninguna de las dos que admite el esquema de
 * content.config.ts: el clic entonces sigue como enlace normal, en vez de
 * abrir un panel vacío.
 */
function contenidoPara(href: string, nombre: string): HTMLElement | null {
  if (ES_PDF.test(href)) {
    const object = document.createElement('object');
    object.type = 'application/pdf';
    object.data = `${href}#toolbar=0&navpanes=0&view=FitH`;
    // El contenido de reserva es lo que ve quien tiene un navegador que se
    // niega a incrustar el PDF (iOS, Android): sin esto, el panel se abriría
    // vacío ahí, sin ninguna forma de llegar al archivo.
    const enlace = document.createElement('a');
    enlace.href = href;
    enlace.target = '_blank';
    enlace.rel = 'noopener';
    enlace.textContent = 'abrir el PDF';
    object.append('El navegador no pudo mostrar el PDF. ', enlace);
    return object;
  }
  if (ES_IMAGEN.test(href)) {
    const img = document.createElement('img');
    img.src = href;
    img.alt = nombre;
    return img;
  }
  return null;
}

document.querySelectorAll<HTMLAnchorElement>('a.visor-abrir').forEach((enlace) => {
  enlace.addEventListener('click', (ev) => {
    // .href (no getAttribute) da la URL ya resuelta y codificada por el
    // propio navegador: un espacio en el nombre real del archivo llega aquí
    // como %20 sin que este módulo tenga que codificar nada por su cuenta.
    const href = enlace.href;
    const nombre = enlace.dataset.nombre ?? '';
    const contenido = contenidoPara(href, nombre);
    if (!contenido) return;

    ev.preventDefault();
    titulo.textContent = nombre;
    cuerpo.replaceChildren(contenido);
    visor.showModal();
  });
});

// stopPropagation(): el <dialog> vive dentro de #term (la sección de
// certificaciones es contenido de la página, montado ahí), y terminal.ts
// escucha el clic en cualquier punto de #term que no sea un enlace ni el
// prompt para devolverle el foco a su campo de comandos oculto. close() ya
// quitó el estado modal de forma síncrona antes de que el clic termine de
// subir hasta document, así que sin cortar la propagación ese oyente ajeno
// alcanza a robarle el foco a la devolución nativa de <dialog> un instante
// después de que ocurre. No es un atrapado de foco propio: es no dejar que
// un clic ya resuelto por este panel se interprete como un clic sobre el
// contenido de la terminal.
botonCerrar.addEventListener('click', (ev) => {
  ev.stopPropagation();
  visor.close();
});

// El backdrop (::backdrop) no es un elemento clicable propio: un clic que cae
// fuera del contenido del <dialog> tiene como target al propio <dialog>. Esta
// comprobación —sin escuchar ninguna tecla ni recorrer a mano los elementos
// enfocables— es la única superficie que showModal() no cierra por su cuenta.
visor.addEventListener('click', (ev) => {
  if (ev.target !== visor) return;
  ev.stopPropagation();
  visor.close();
});

// Vaciar el cuerpo al cerrar —también cuando cierra por su propio mecanismo
// nativo del teclado— evita que un PDF de más de 1 MB siga cargado en memoria
// entre una apertura y la siguiente.
visor.addEventListener('close', () => cuerpo.replaceChildren());
