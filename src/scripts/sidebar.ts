// La barra lateral: workspaces arriba, documentos abiertos abajo.
//
// Vive en su propio .ts por la misma razón que la terminal: así `tsc` la
// revisa. Este módulo no sabe nada de comandos ni de historial — solo de qué
// workspace está activo y qué documentos se han abierto en la sesión.

const sidebar = document.getElementById('sidebar');
const alterna = document.getElementById('sidebar-toggle');
const cerrar_ = document.getElementById('sidebar-cerrar');
const scrim = document.getElementById('sidebar-scrim');
const workspacesNav = document.getElementById('sidebar-workspaces');
const abiertosLista = document.getElementById('sidebar-abiertos-lista');
const term = document.getElementById('term');

// Sin este andamiaje no hay barra lateral que gobernar. Fallar acá es mejor
// que dejar la mitad montada respondiendo a medias.
if (!sidebar || !alterna || !cerrar_ || !scrim || !workspacesNav || !abiertosLista || !term) {
  throw new Error('sidebar: falta el andamiaje del documento');
}

// El resto del módulo puede tratar estas constantes como no nulas: la guarda
// de arriba ya lo garantizó, pero TypeScript no arrastra el estrechamiento
// dentro de las funciones que se declaran después.
const raiz = document.documentElement;
const nodoSidebar = sidebar;
const botonAlterna = alterna;
const botonCerrar = cerrar_;
const nodoScrim = scrim;
const nodoWorkspaces = workspacesNav;
const nodoAbiertos = abiertosLista;
const nodoTerm = term;
const stAbiertos = document.getElementById('st-abiertos');

// Presencia de JavaScript: sin esta marca la barra queda apilada y visible
// siempre (ver sidebar.css), que es el estado correcto sin script. Con ella,
// se convierte en una cortina que se abre sobre el contenido.
raiz.classList.add('js');

// ── Almacenamiento de sesión ─────────────────────────────────────────────
// Todo en sessionStorage: sobrevive a una recarga y empieza de cero en una
// visita nueva. Cada acceso va envuelto en un try — una sesión sin
// almacenamiento (ventana privada, permisos) no es motivo para que la barra
// deje de funcionar, solo para que olvide el estado entre páginas.

const CLAVE_VISITADAS = 'jbsh:visitadas';
const CLAVE_ABIERTOS = 'jbsh:abiertos';
const TOPE_ABIERTOS = 8;

function cargarVisitadas(): Set<string> {
  try {
    const crudo = sessionStorage.getItem(CLAVE_VISITADAS);
    return new Set(crudo ? (JSON.parse(crudo) as string[]) : []);
  } catch {
    return new Set();
  }
}

function guardarVisitadas(visitadas: Set<string>) {
  try {
    sessionStorage.setItem(CLAVE_VISITADAS, JSON.stringify([...visitadas]));
  } catch {
    /* sin almacenamiento el estado de visitado dura lo que la página */
  }
}

interface Abierto {
  href: string;
  titulo: string;
  tipo: string;
}

/** Lo guardado en la sesión se trata como entrada no confiable: cualquiera
 * puede editarlo desde las herramientas del navegador. Un href que no sea una
 * ruta interna (`//otro.dominio`, `javascript:`) convertiría una fila de
 * «abiertos» en un enlace hacia afuera disfrazado de propio. */
function esAbiertoValido(x: unknown): x is Abierto {
  if (typeof x !== 'object' || x === null) return false;
  const { href, titulo, tipo } = x as Record<string, unknown>;
  return (
    typeof href === 'string' &&
    /^\/(?![/\\])/.test(href) &&
    typeof titulo === 'string' &&
    typeof tipo === 'string'
  );
}

function cargarAbiertos(): Abierto[] {
  try {
    const crudo = sessionStorage.getItem(CLAVE_ABIERTOS);
    const datos: unknown = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(datos) ? datos.filter(esAbiertoValido).slice(0, TOPE_ABIERTOS) : [];
  } catch {
    return [];
  }
}

function guardarAbiertos(lista: Abierto[]) {
  try {
    sessionStorage.setItem(CLAVE_ABIERTOS, JSON.stringify(lista));
  } catch {
    /* sin almacenamiento la lista de abiertos dura lo que la página */
  }
}

// ── Workspaces ────────────────────────────────────────────────────────────
// ◉ el actual, ● uno visitado en esta sesión, ○ uno que no. El glifo es
// decorativo (aria-hidden en la plantilla); el estado real lo dice el texto
// para lector de pantalla que va justo al lado.

function renderWorkspaces(actual: string, detalle: boolean) {
  const visitadas = cargarVisitadas();
  visitadas.add(actual);
  guardarVisitadas(visitadas);

  nodoWorkspaces.querySelectorAll<HTMLAnchorElement>('a.ws-item').forEach((a) => {
    const slug = a.dataset.slug ?? '';
    const esActual = slug === actual;
    const visitada = !esActual && visitadas.has(slug);

    a.classList.toggle('ws-actual', esActual);
    a.classList.toggle('ws-visitada', visitada);
    if (esActual) a.setAttribute('aria-current', detalle ? 'location' : 'page');
    else a.removeAttribute('aria-current');

    const glifo = a.querySelector('.ws-glifo');
    if (glifo) glifo.textContent = esActual ? '◉' : visitada ? '●' : '○';

    const estado = a.querySelector('.sr-only');
    if (estado) estado.textContent = esActual ? 'actual' : visitada ? 'visitado' : 'sin visitar';
  });
}

// ── Abiertos ──────────────────────────────────────────────────────────────

const ETIQUETA_TIPO: Record<string, string> = {
  proyecto: 'proyecto',
  publicacion: 'publicación',
  stack: 'stack',
};

function etiquetaDe(tipo: string): string {
  return ETIQUETA_TIPO[tipo] ?? tipo;
}

/** El segmento de la statusline que cuenta los documentos abiertos. Nunca se
 * escribe a mano: sale del mismo dato que dibuja la lista, así que nunca
 * puede desincronizarse de ella. */
function actualizarStatusAbiertos(n: number) {
  if (!stAbiertos) return;
  stAbiertos.textContent = `${n} ${n === 1 ? 'abierto' : 'abiertos'}`;
}

/** Reconstruye la lista visible desde los datos: crea cada fila de cero, así
 * que sus clases no llevan la marca de alcance de Astro — igual que el resto
 * de lo que crea un script. Sus reglas viven en sidebar.css, sin alcance.
 *
 * Misma forma que una fila de workspace: glifo y título en la primera línea
 * (.ws-linea1, reutilizada tal cual), el estado solo como texto en la
 * segunda — así las dos listas comparten borde izquierdo, relleno y
 * indentación sin que haga falta duplicar ninguna regla. */
function renderAbiertos(lista: Abierto[]) {
  nodoAbiertos.replaceChildren();

  if (!lista.length) {
    const li = document.createElement('li');
    li.className = 'ab-vacio';
    li.textContent = 'nada abierto';
    nodoAbiertos.append(li);
    actualizarStatusAbiertos(0);
    return;
  }

  const aqui = location.pathname.replace(/\/$/, '') || '/';

  for (const item of lista) {
    const esActual = item.href.replace(/\/$/, '') === aqui;

    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = esActual ? 'ab-item ab-actual' : 'ab-item';
    a.href = item.href;
    if (esActual) a.setAttribute('aria-current', 'page');

    const linea1 = document.createElement('span');
    linea1.className = 'ws-linea1';
    const glifo = document.createElement('span');
    glifo.className = 'ab-glifo';
    glifo.setAttribute('aria-hidden', 'true');
    glifo.textContent = esActual ? '◉' : '✓';
    const titulo = document.createElement('span');
    titulo.className = 'ab-titulo';
    titulo.textContent = item.titulo;
    linea1.append(glifo, titulo);

    const sub = document.createElement('span');
    sub.className = 'ab-sub';
    sub.textContent = `${esActual ? 'leyendo' : 'leído'} · ${etiquetaDe(item.tipo)}`;

    a.append(linea1, sub);
    li.append(a);
    nodoAbiertos.append(li);
  }

  actualizarStatusAbiertos(lista.length);
}

/**
 * El documento propio ya llegó renderizado por el servidor, como el único
 * «leyendo» — así funciona sin JavaScript. Acá se fusiona con lo que ya
 * había en la sesión: se quita cualquier entrada repetida, se pone primero y
 * se recorta al tope.
 */
function fusionarDocumentoActual(): Abierto[] {
  let abiertos = cargarAbiertos();
  const actualAnchor = nodoAbiertos.querySelector<HTMLAnchorElement>('a.ab-actual');
  if (!actualAnchor) return abiertos;

  const href = actualAnchor.getAttribute('href') ?? '';
  const titulo = actualAnchor.querySelector('.ab-titulo')?.textContent ?? '';
  const tipo = actualAnchor.dataset.tipo ?? '';
  if (!href) return abiertos;

  abiertos = [{ href, titulo, tipo }, ...abiertos.filter((a) => a.href !== href)].slice(0, TOPE_ABIERTOS);
  guardarAbiertos(abiertos);
  return abiertos;
}

// ── Arranque ─────────────────────────────────────────────────────────────

renderWorkspaces(nodoTerm.dataset.seccion ?? '', nodoTerm.dataset.detalle === '1');
renderAbiertos(fusionarDocumentoActual());

// La navegación sin recarga entre workspaces (terminal.ts) actualiza
// data-seccion y data-detalle en #term; esta barra los observa en vez de que
// terminal.ts tenga que conocerla. Una página de detalle siempre llega por
// una recarga completa, así que esta rama nunca necesita re-fusionar
// «abiertos»: eso solo pasa una vez, al arrancar.
new MutationObserver(() => {
  renderWorkspaces(nodoTerm.dataset.seccion ?? '', nodoTerm.dataset.detalle === '1');
}).observe(nodoTerm, { attributes: true, attributeFilter: ['data-seccion', 'data-detalle'] });

// ── Cortina en móvil ─────────────────────────────────────────────────────
// Sin JavaScript la barra queda apilada y visible siempre (sidebar.css). Con
// él, se convierte en una cortina que se abre sobre el contenido: no hay
// espacio para dos columnas.
//
// Mientras está abierta se comporta como un diálogo modal: el resto de la
// página queda `inert` (ni foco ni clic la alcanzan) y una cortina de fondo
// la cubre visualmente. No es una trampa de teclado — Escape y el botón de
// cerrar siempre son una salida — es justo lo que hace `inert`: no dejar
// nada enfocable detrás de la superposición.

/** Todo lo que queda detrás de la cortina mientras está abierta. Se calcula
 * cada vez, sin guardarlo en una constante: el campo de comandos de la
 * terminal (.entry) lo crea terminal.ts en tiempo de ejecución, y puede que
 * ese módulo, cargado después, todavía no lo haya creado cuando este arranca. */
function elementosDeFondo(): Element[] {
  return [botonAlterna, nodoTerm, document.querySelector('.status'), document.querySelector('.foot'), document.querySelector('input.entry')].filter(
    (el): el is Element => el !== null,
  );
}

function abrir() {
  nodoSidebar.classList.add('abierta');
  nodoScrim.classList.add('abierta');
  botonAlterna.setAttribute('aria-expanded', 'true');
  // El nombre accesible solo tiene sentido junto con el rol: un aria-label
  // fijo en la plantilla, sin role, es un aria-prohibited-attr de axe.
  nodoSidebar.setAttribute('role', 'dialog');
  nodoSidebar.setAttribute('aria-modal', 'true');
  nodoSidebar.setAttribute('aria-label', 'Menú');
  for (const el of elementosDeFondo()) el.setAttribute('inert', '');
  botonCerrar.focus();
}

function cerrar() {
  nodoSidebar.classList.remove('abierta');
  nodoScrim.classList.remove('abierta');
  botonAlterna.setAttribute('aria-expanded', 'false');
  nodoSidebar.removeAttribute('role');
  nodoSidebar.removeAttribute('aria-modal');
  nodoSidebar.removeAttribute('aria-label');
  for (const el of elementosDeFondo()) el.removeAttribute('inert');
}

function estaAbierta(): boolean {
  return nodoSidebar.classList.contains('abierta');
}

botonAlterna.addEventListener('click', () => {
  if (estaAbierta()) cerrar();
  else abrir();
});

botonCerrar.addEventListener('click', () => {
  cerrar();
  botonAlterna.focus();
});

// La cortina de fondo también cierra: es la única superficie clicable fuera
// de la barra mientras está abierta, todo lo demás quedó inerte.
nodoScrim.addEventListener('click', () => {
  cerrar();
  botonAlterna.focus();
});

// Un enlace elegido cierra la cortina: quien elige a dónde ir no necesita
// verla un instante más.
nodoSidebar.addEventListener('click', (ev) => {
  if (!estaAbierta()) return;
  const t = ev.target;
  if (t instanceof Element && t.closest('a')) cerrar();
});

// Escape cierra y devuelve el foco al botón que abrió: sin esto, quien
// cierra con teclado queda con el foco en un elemento que ya no ve.
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape' || !estaAbierta()) return;
  cerrar();
  botonAlterna.focus();
});

// Si la ventana crece por encima del punto de quiebre con la cortina abierta
// (girar una tableta, agrandar la ventana), los botones de abrir y cerrar
// desaparecen y el contenido quedaría inerte sin forma de salir con el ratón.
// Debe coincidir con el único punto de quiebre de las hojas de estilo.
const movil = matchMedia('(max-width: 660px)');
movil.addEventListener('change', () => {
  if (!movil.matches && estaAbierta()) cerrar();
});
