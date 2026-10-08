import type { Indice } from '../lib/tipos';
import { renderSecciones, renderEntradas, renderStack } from '../lib/render';

// La terminal.
//
// Vive en un .ts y no dentro del <script> del componente por una razón
// concreta: así `tsc` la revisa. Un script suelto en un .astro no lo comprueba
// nadie, y este archivo maneja navegación, historial y estado.

const nodoScroll = document.getElementById('scroll');
const nodoTerm = document.getElementById('term');
const stPath = document.getElementById('st-path');
const stClock = document.getElementById('st-clock');
// La lista de secciones ya no vive en un header de pestañas: vive en los
// workspaces de la barra lateral. sidebar.ts marca cuál está activo; acá solo
// se lee, para completar comandos y para que un clic sobre un enlace de
// workspace navegue sin recargar en vez de repetir la petición al servidor.
const workspaces = document.getElementById('sidebar-workspaces');
// El h1 de la pantalla montada. `navegar()` lo reescribe con el lead del
// destino para que el encabezado no se quede con el de la página anterior
// (WCAG 2.4.2 / 1.3.1). No todas las páginas lo montan igual, así que se
// tolera que falte.
let nodoLead = document.querySelector<HTMLHeadingElement>('h1.lead');

// Si falta el andamiaje, no hay terminal que arrancar. Fallar acá es mejor que
// dejar media interfaz montada respondiendo a medias.
if (!nodoScroll || !nodoTerm) throw new Error('terminal: falta el andamiaje del documento');

// Se rebautizan después de la comprobación: TypeScript no arrastra el
// estrechamiento hasta dentro de las funciones, y sin esto cada uso pediría un
// `!` que apaga la verificación en vez de aprovecharla.
const scroll = nodoScroll;
const term = nodoTerm;

const BRAIN = term.dataset.brain ?? '';
const SECCIONES: string[] = [...(workspaces?.querySelectorAll('a') ?? [])].map((a) =>
  (a.getAttribute('href') ?? '').slice(1),
);

/** Sección montada. Cambia al navegar sin recargar. */
let aqui = term.dataset.seccion ?? '';

// La pantalla tal como la entregó el servidor: arranque, banner y primera
// salida. Se guarda antes de que el prompt la toque, para poder volver a ella.
const pantallaInicial = scroll.innerHTML;
let indice: Indice | null = null;

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  txt?: string,
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
};

// Mientras arranca, la salida ya viene escrita por el servidor y el prompt se
// añade al final: desplazarse ahí dejaría a quien llega en la mitad del texto
// —251 px hacia abajo en el inicio— obligándolo a subir para leer desde el
// principio. Una terminal de verdad arranca vacía y crece hacia abajo; esta
// llega con todo escrito, así que el desplazamiento automático solo tiene
// sentido cuando ya hay alguien ejecutando comandos.
let arrancando = true;

const push = (n: Node) => {
  scroll.append(n);
  if (!arrancando) term.scrollTop = term.scrollHeight;
};

const line = (cls: string, txt: string) => push(el('div', 'out ' + cls, txt));

// El teclado no sube solo: en un teléfono tapa media pantalla, y esta página se
// lee entera sin escribir nada. Solo lo levanta tocar el prompt.
const TOUCH = matchMedia('(hover: none) and (pointer: coarse)').matches;

const input = el('input', 'entry');
input.setAttribute('aria-label', 'Línea de comandos');
input.autocomplete = 'off';
input.spellcheck = false;
document.body.append(input);

interface Live {
  node: HTMLElement;
  typed: HTMLElement;
}

let live: Live | null = null;
let ok = true;

// ── Historial ──────────────────────────────────────────────────────────────
// Se guarda en la sesión y no en el almacenamiento persistente: es un historial
// de comandos, no un dato del usuario que valga la pena conservar entre visitas.
const CLAVE = 'jbsh:historial';

const cargarHistorial = (): string[] => {
  try {
    return JSON.parse(sessionStorage.getItem(CLAVE) ?? '[]') as string[];
  } catch {
    // Una sesión sin almacenamiento —ventana privada, permisos— no es motivo
    // para quedarse sin terminal.
    return [];
  }
};

let historial = cargarHistorial();
let hIdx = historial.length;
/** Lo que se estaba escribiendo al empezar a recorrer el historial con ↑. */
let borrador: string | null = null;

const recordar = (cmd: string) => {
  if (!cmd.trim() || historial[historial.length - 1] === cmd) return;
  historial = [...historial, cmd].slice(-50);
  hIdx = historial.length;
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(historial));
  } catch {
    /* sin almacenamiento el historial dura lo que la página */
  }
};

// ── Movimiento ─────────────────────────────────────────────────────────────
// Todo es un añadido visual sobre un DOM que ya está completo: el texto de cada
// línea (incluido el comando que se «escribe») está entero desde el primer
// momento, porque #scroll es aria-live y animar el contenido letra por letra
// haría que el lector de pantalla lo anunciara así. Lo único que cambia es qué
// se ve (opacity, clip-path), y eso lo dicen las clases de terminal.css.

const raiz = document.documentElement;

/** Se consulta cada vez: la persona puede cambiar la preferencia con la página abierta. */
const reducido = matchMedia('(prefers-reduced-motion: reduce)');

/** Marca de «el arranque ya se animó en esta sesión». La lee arranque-gate.js. */
const CLAVE_ARRANQUE = 'jbsh:arranque';

/** Valor de un token de movimiento de tokens.css (en ms), para que el CSS y el
 * escalonado de aquí no se desincronicen. */
const mov = (token: string, defecto: number): number => {
  const v = parseFloat(getComputedStyle(raiz).getPropertyValue(token));
  return Number.isFinite(v) ? v : defecto;
};

/** Lo que dura como máximo la cascada de una salida, sea cual sea su tamaño. */
const TOPE_CASCADA = 600;

// Un solo planificador: todo temporizador de la animación pasa por programar(),
// así terminarAnimacion() los cancela todos juntos. Sin esto, navegar dos veces
// seguidas dejaría relojes de la pantalla anterior tocando nodos que ya no están.
let relojes: number[] = [];

const programar = (fn: () => void, ms: number) => {
  relojes.push(window.setTimeout(fn, ms));
};

/**
 * Corta la animación en curso y deja todo en su estado final y visible. Es
 * idempotente: se llama al empezar cada navegación, al ejecutar un comando y
 * al terminar la propia animación.
 */
function terminarAnimacion() {
  for (const id of relojes) clearTimeout(id);
  relojes = [];
  raiz.classList.remove('arranque', 'entrada');
  scroll.classList.remove('cambia');
  for (const n of scroll.querySelectorAll('.entra, .escribiendo, .visto')) {
    n.classList.remove('entra', 'escribiendo', 'visto');
  }
}

/** Reinicia el fundido de la pantalla (quitar, forzar el cálculo, volver a poner). */
function desvanecer() {
  if (reducido.matches) return;
  scroll.classList.remove('cambia');
  void scroll.offsetWidth;
  scroll.classList.add('cambia');
}

/**
 * Primera visita de la sesión: las líneas del arranque, el `ok`, la ficha y el
 * resto de la pantalla van apareciendo en ese orden. La decisión de animar ya
 * la tomó arranque-gate.js (puso .arranque en <html> antes del primer
 * pintado); acá solo se ejecuta, y se anota para que la próxima carga de la
 * sesión no la repita.
 */
function arrancarAnimado() {
  if (!raiz.classList.contains('arranque')) return;
  if (reducido.matches) return terminarAnimacion();
  try {
    sessionStorage.setItem(CLAVE_ARRANQUE, '1');
  } catch {
    /* sin almacenamiento el guion previo ya habría decidido no animar */
  }

  const fade = mov('--mov-fade', 200);
  const paso = mov('--mov-arranque', 80);
  const escalon = mov('--mov-escalon', 60);
  const mostrar = (n: Element, ms: number) => programar(() => n.classList.add('visto'), ms);

  let t = 0;
  for (const l of scroll.querySelectorAll('.boot .out')) {
    mostrar(l, t);
    t += paso;
  }
  // El `ok` se enciende cuando la última línea ya terminó de aparecer.
  const ok = scroll.querySelector('.boot .ok');
  t += fade - paso;
  if (ok) mostrar(ok, t);
  t += fade;
  const ficha = scroll.querySelector('.fetch');
  if (ficha) mostrar(ficha, t);
  t += fade / 2;
  // Lo demás —encabezado, comando, salida, prompt— entra en cascada corta.
  for (const n of scroll.querySelectorAll(':scope > :not(.boot, .fetch)')) {
    mostrar(n, t);
    t += escalon;
  }
  programar(terminarAnimacion, t + fade);
}

/**
 * La salida de un `cd`: el comando se escribe y, cuando termina, las entradas
 * aparecen una a una. `entradas` ya está dentro de #scroll; aquí solo se ocultan
 * para mostrarlas por turnos.
 */
function animarNavegacion(typed: HTMLElement, entradas: Element[]) {
  const n = (typed.textContent ?? '').length;
  typed.style.setProperty('--n', String(n));
  typed.classList.add('escribiendo');
  desvanecer();

  const escalon = mov('--mov-escalon', 60);
  const inicio = n * mov('--mov-tipeo', 25) + escalon;
  const paso = Math.min(escalon, TOPE_CASCADA / Math.max(entradas.length, 1));
  entradas.forEach((e, i) => {
    e.classList.add('entra');
    programar(() => e.classList.add('visto'), inicio + i * paso);
  });
  programar(terminarAnimacion, inicio + entradas.length * paso + mov('--mov-fade', 200));
}

/**
 * Las entradas que se muestran en cascada en una página que el servidor
 * entregó completa: las filas y paneles de #salida, los hijos de un artículo y
 * los bloques de primer nivel del resto. No cada nodo pequeño: la cascada tiene
 * que leerse como líneas que llegan, no como un temblor.
 */
function entradasDePagina(): Element[] {
  const entradas: Element[] = [];
  for (const hijo of scroll.children) {
    if (hijo.matches('.done, .sp, .inputline, .boot, .fetch')) continue;
    if (hijo.id === 'salida') {
      const filas = [...hijo.querySelectorAll('.panels > *, tr')];
      entradas.push(...(filas.length ? filas : hijo.children));
    } else if (hijo.matches('article')) {
      entradas.push(...hijo.children);
    } else {
      entradas.push(hijo);
    }
  }
  return entradas;
}

/**
 * El mismo `cd` de navegar(), para una página entregada por el servidor a la
 * que se llegó desde dentro del sitio. arranque-gate.js ya ocultó el contenido
 * antes del primer pintado (clase .entrada); acá se reparte el estado oculto
 * fino y se quita la clase gruesa en el mismo turno.
 */
function entrarPagina() {
  if (!raiz.classList.contains('entrada')) return;
  const typed = scroll.querySelector<HTMLElement>('.done .typed');
  if (reducido.matches || !typed) return terminarAnimacion();
  animarNavegacion(typed, entradasDePagina());
  raiz.classList.remove('entrada');
}

// Restaurada desde la caché de atrás/adelante, la página vuelve con su estado:
// nada debe quedar oculto ni repetirse a medias.
addEventListener('pageshow', (ev) => {
  if (ev.persisted) terminarAnimacion();
});

// ── Prompt ─────────────────────────────────────────────────────────────────

function prompt() {
  const l = el('div', 'out inputline');
  l.append(
    el('span', 'brain ' + (ok ? 'ok' : 'err'), BRAIN),
    el('span', 'typed', ''),
    el('span', 'caret'),
    el('span', 'tap-hint', 'toque aquí para escribir'),
  );
  push(l);
  const typed = l.querySelector<HTMLElement>('.typed');
  live = typed ? { node: l, typed } : null;
  input.value = '';
  cerrarListView();
  if (!TOUCH) input.focus({ preventScroll: true });
}

// ── Comandos ───────────────────────────────────────────────────────────────

const HELP: [string, string][] = [
  ['ls', 'Listar lo que hay aquí'],
  ['cd <sección>', 'Entrar en una sección'],
  ['cd ~', 'Volver al inicio'],
  ['whoami', 'Quién soy'],
  ['stack', 'Con qué trabajo, contado desde los datos'],
  ['contacto', 'Dónde encontrarme'],
  ['pwd', 'Dónde estoy'],
  ['c', 'Limpiar y volver al inicio'],
  ['help', 'Esto'],
];

/** Todo lo que se puede completar con Tab, en el contexto actual. */
const completables = (): string[] => [
  ...HELP.map(([c]) => c.split(' ')[0]),
  ...SECCIONES,
  ...SECCIONES.map((s) => 'cd ' + s),
  ...(indice?.entradas[aqui] ?? []).map((f) => 'cat ' + f.slug),
];

/**
 * Navegación sin recarga. La URL cambia de verdad: quien comparte el enlace
 * comparte lo que está viendo, y el botón «atrás» hace lo que promete.
 *
 * Si algo falla —el índice no cargó, la sección no existe— se cae a una
 * navegación normal. El servidor ya sabe renderizar cualquiera de estas URLs.
 */
function navegar(seccion: string, empujar = true): boolean {
  const url = seccion ? '/' + seccion : '/';

  // El inicio no es una sección más: su pantalla es el arranque, la foto y el
  // bloque de datos, y eso solo lo tiene el HTML que entregó el servidor.
  // Repintar su listado dejaba el inicio sin nada de eso —lo notó el dueño del
  // sitio al hacer clic en la marca—, así que se restituye esa pantalla tal
  // cual, o se pide al servidor si venimos de otra URL.
  if (!seccion) return reiniciar();

  // Sin índice no hay nada que renderizar acá. El servidor sabe hacerlo.
  if (!indice) return irFuera(url);

  // Una sección de tipo página no es una lista: su contenido son bloques con
  // experiencia, formación o datos de contacto, y eso lo arma el servidor. Solo
  // las colecciones se pueden listar en el cliente.
  const meta = indice.secciones.find((s) => s.slug === seccion);
  if (seccion && meta?.tipo !== 'coleccion') return irFuera(url);

  // Cambiar de sección limpia la pantalla, como `clear && ls`. Antes la salida
  // se añadía debajo, con el historial completo: tenía sentido cuando la
  // pantalla era solo un historial, pero desde que el <title> y el h1 cambian
  // por sección (abajo), la página afirma ser una sección y mostraba la
  // anterior encima. El h1 se conserva —es el encabezado del documento, no
  // salida— y la línea del comando se repone para que la pantalla quede igual
  // que si el servidor la hubiera entregado así.
  //
  // Antes de tocar nada se corta la animación anterior: si la persona navega
  // otra vez a mitad de una cascada, no quedan relojes ni nodos a medio mostrar.
  terminarAnimacion();
  for (const nodo of [...scroll.children]) if (nodo !== nodoLead) nodo.remove();
  const comando = seccion ? `cd ${seccion}` : 'ls';
  const linea = el('div', 'out done');
  const typed = el('span', 'typed', comando);
  linea.append(el('span', 'brain ok', BRAIN), typed);
  push(linea);
  const salida = fragmento(seccion ? renderEntradas(indice.entradas[seccion] ?? []) : renderSecciones(indice.secciones));
  // Las filas de la salida, para la cascada. Se toman antes de push(): al
  // insertar el fragmento deja de tener hijos.
  const entradas = [...salida.querySelectorAll('.panels > *, tr')];
  if (!entradas.length) entradas.push(...salida.children);
  push(salida);
  if (!reducido.matches) animarNavegacion(typed, entradas);

  aqui = seccion;
  term.dataset.seccion = seccion;
  // Nunca a una página de detalle: esta rama solo navega entre workspaces
  // completos. sidebar.ts observa este atributo para actualizar la barra
  // lateral sin que este módulo tenga que conocerla.
  term.dataset.detalle = '';
  if (stPath) stPath.textContent = seccion ? `~/${seccion}` : '~/';

  // El <title> y el h1 no vienen fijos en el marcado de esta pantalla: sin
  // esto, `cd proyectos` dejaba la pestaña y el encabezado del inicio después
  // de navegar sin recargar (hallazgo U2 del QA, WCAG 2.4.2 / 1.3.1). El
  // destino es el inicio o la sección que se acaba de renderizar arriba.
  const datos = seccion ? meta : indice.inicio;
  if (datos) {
    document.title = datos.titulo;
    // El lead es contenido propio, como la salida de render.ts: ya viene de
    // confianza y no de algo que haya escrito quien visita el sitio.
    if (nodoLead) nodoLead.innerHTML = datos.lead;
  }

  if (empujar) history.pushState({ seccion }, '', url);
  return true;
}

/** HTML de render.ts a nodos. El contenido es propio y ya viene escapado. */
function fragmento(html: string): DocumentFragment {
  return document.createRange().createContextualFragment(html);
}

const irFuera = (href: string): boolean => {
  location.href = href;
  return true;
};

function exec(raw: string): boolean {
  const partes = raw.trim().split(/\s+/);
  const cmd = partes[0];
  const arg = partes[1];
  if (!cmd) return true;

  switch (cmd) {
    case 'help':
    case '?': {
      const t = el('table', 'list');
      HELP.forEach(([c, d]) => {
        const tr = el('tr');
        tr.append(el('td', 'n', c), el('td', 'd', d));
        t.append(tr);
      });
      push(t);
      return true;
    }

    case 'ls':
    case 'll':
    case 'dir': {
      if (!indice) return irFuera(aqui ? '/' + aqui : '/');
      const html = aqui
        ? renderEntradas(indice.entradas[aqui] ?? [])
        : renderSecciones(indice.secciones);
      push(fragmento(html));
      return true;
    }

    case 'cd':
    case 'z': {
      if (!arg || arg === '~' || arg === '/') return navegar('');
      const destino = arg.replace(/^\/+|\/+$/g, '');
      if (SECCIONES.includes(destino)) return navegar(destino);
      line('fg-red', `cd: ${destino}: no existe`);
      line('fg-dim', "Escriba 'ls' para ver qué hay.");
      return false;
    }

    case '..':
    case '...':
      return navegar('');

    case 'pwd':
      line('fg-blue', aqui ? '/' + aqui : '/');
      return true;

    case 'cat':
    case 'bat':
    case 'glow':
    case 'less':
    case 'open': {
      if (!arg) {
        line('fg-red', `${cmd}: falta el argumento`);
        return false;
      }
      const fila = (indice?.entradas[aqui] ?? []).find((f) => f.slug === arg);
      if (!fila) {
        line('fg-red', `${cmd}: ${arg}: no existe`);
        return false;
      }
      // El cuerpo se lee en su propia URL, con el Markdown ya procesado por
      // Astro. Traerlo acá obligaría a mandar un analizador al navegador.
      const destino = fila.href ?? fila.externo?.href;
      if (!destino) {
        line('fg-dim', `${arg}: no tiene cuerpo propio`);
        return false;
      }
      return irFuera(destino);
    }

    case 'stack': {
      if (!indice) return irFuera('/sobre-mi#stack');
      push(fragmento(renderStack(indice.stack)));
      return true;
    }

    case 'whoami':
      return irFuera('/sobre-mi');

    case 'contacto':
      return irFuera('/contacto');

    case 'c':
    case 'clear':
    case 'cls':
      // Limpia y vuelve a la pantalla de inicio: el arranque, la ficha y el
      // listado, desde cualquier sección. Historia, para no repetirla: esto ya
      // fue así, y se cambió a «limpiar la sección actual» porque en el inicio
      // parecía no hacer nada —restituía la misma pantalla sin señal alguna—
      // y en una sección sacaba de donde estabas. El dueño del sitio pidió
      // volver al inicio (2026-10-07). Lo primero ya no ocurre: reiniciar()
      // hace un fundido, así que la limpieza se ve aunque la pantalla resulte
      // igual. Una pantalla vacía de verdad sigue sin servir: en un sitio web
      // es un callejón sin salida.
      return reiniciar();

    case 'g':
    case 'github':
      return irFuera('https://github.com/MrT-coder');

    case 'date':
      line('fg-muted', new Date().toLocaleString('es-EC'));
      return true;

    default:
      line('fg-red', cmd + ': comando no encontrado');
      line('fg-dim', "Escriba 'help', o pulse Tab para ver qué hay.");
      return false;
  }
}

/**
 * Vuelve al inicio: la portada, con su arranque y su listado. Desde otra URL
 * hace falta pedirla al servidor, que es quien tiene ese HTML.
 */
function reiniciar(): boolean {
  if (location.pathname !== '/') return irFuera('/');
  // Se restituye la pantalla tal como la entregó el servidor, ya visible: el
  // arranque animado es solo de la primera carga, no de volver al inicio.
  terminarAnimacion();
  scroll.innerHTML = pantallaInicial;
  desvanecer();
  // El h1 vive dentro de #scroll, así que reemplazar el HTML lo sustituye por
  // otro nodo: sin volver a buscarlo, la referencia apuntaría a un elemento
  // que ya no está en la página y el encabezado dejaría de actualizarse.
  nodoLead = document.querySelector<HTMLHeadingElement>('h1.lead');
  if (indice) document.title = indice.inicio.titulo;
  aqui = '';
  term.dataset.seccion = '';
  term.dataset.detalle = '';
  if (stPath) stPath.textContent = '~/';
  term.scrollTop = 0;
  return true;
}

function run() {
  const raw = input.value;
  const escribiendo = document.activeElement === input;
  // Quien ejecuta algo no espera a que termine la animación anterior, y lo que
  // este comando añada no debe quedar oculto detrás de ella.
  terminarAnimacion();
  if (live) {
    live.node.querySelector('.caret')?.remove();
    live.node.querySelector('.tap-hint')?.remove();
    live.typed.textContent = raw;
    live = null;
  }
  recordar(raw);
  ok = exec(raw);
  prompt();
  if (escribiendo && live) {
    (live as Live).node.classList.add('typing');
    input.focus();
  }
}

// ── ListView ───────────────────────────────────────────────────────────────
// La respuesta de PSReadLine al «no sé qué escribir»: las opciones aparecen
// mientras se teclea, en vez de esconderse detrás de Tab.

let lv: HTMLElement | null = null;
/** Las opciones con que se abrió la lista. Recorrerlas no las vuelve a filtrar. */
let lvOpciones: string[] = [];
/** Fila seleccionada con las flechas; -1 es «ninguna»: el texto que escribió la persona. */
let lvSel = -1;
/** Lo que había en el campo al abrir la lista, para que Escape (o volver a -1) lo devuelva. */
let lvEscrito = '';

function cerrarListView() {
  lv?.remove();
  lv = null;
  lvOpciones = [];
  lvSel = -1;
  // El campo deja de apuntar a una lista que ya no existe.
  input.removeAttribute('aria-activedescendant');
  input.removeAttribute('aria-controls');
}

function abrirListView(opciones: string[]) {
  cerrarListView();
  if (!opciones.length || !live) return;
  const caja = el('div', 'lv');
  caja.id = 'lv-lista';
  caja.setAttribute('role', 'listbox');
  caja.setAttribute('aria-label', 'Sugerencias');
  lvOpciones = opciones.slice(0, 6);
  lvEscrito = input.value;
  lvOpciones.forEach((o, i) => {
    const fila = el('div', 'lv-i');
    fila.id = 'lv-i-' + i;
    fila.setAttribute('role', 'option');
    fila.setAttribute('aria-selected', 'false');
    fila.textContent = o;
    fila.addEventListener('click', () => {
      input.value = o;
      sincronizar();
      run();
    });
    caja.append(fila);
  });
  live.node.after(caja);
  lv = caja;
  input.setAttribute('aria-controls', caja.id);
  term.scrollTop = term.scrollHeight;
}

/**
 * Marca la fila `i` (o ninguna, con -1) y la muestra en el prompt, como el
 * ListView de PSReadLine. No vuelve a filtrar: la lista conserva las opciones
 * originales para poder seguir recorriéndola; solo teclear de nuevo la rehace.
 */
function seleccionar(i: number) {
  if (!lv) return;
  lvSel = i;
  [...lv.children].forEach((fila, k) => {
    fila.classList.toggle('sel', k === i);
    fila.setAttribute('aria-selected', String(k === i));
  });
  input.value = i < 0 ? lvEscrito : lvOpciones[i];
  if (i < 0) input.removeAttribute('aria-activedescendant');
  else {
    input.setAttribute('aria-activedescendant', 'lv-i-' + i);
    lv.children[i].scrollIntoView({ block: 'nearest' });
  }
  sincronizar();
}

const sincronizar = () => {
  if (live) live.typed.textContent = input.value;
};

// ── Entrada ────────────────────────────────────────────────────────────────

input.addEventListener('input', () => {
  // Teclear de nuevo abandona el recorrido del historial: el borrador ya no es
  // el que se guardó.
  borrador = null;
  hIdx = historial.length;
  sincronizar();
  const v = input.value.trim();
  if (!v) return cerrarListView();
  abrirListView(completables().filter((c) => c.startsWith(v) && c !== v));
});

input.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    ev.preventDefault();
    run();
    return;
  }

  if (ev.key === 'Tab') {
    // Shift+Tab nunca completa: siempre sale hacia atrás. Con el input vacío
    // tampoco hay nada que completar, así que Tab se comporta como Tab normal
    // y deja salir el foco hacia los enlaces de la página. Una terminal que se
    // queda con la tecla y no devuelve nada deja fuera a quien no usa ratón.
    const v = input.value.trim();
    if (ev.shiftKey || !v) return;
    ev.preventDefault();
    const opciones = completables().filter((c) => c.startsWith(v));
    if (!opciones.length) return;
    // Con una sola opción, completar. Con varias, el prefijo común: es lo que
    // hace una terminal de verdad y evita elegir por el usuario.
    input.value = opciones.length === 1 ? opciones[0] : prefijoComun(opciones);
    sincronizar();
    abrirListView(opciones.filter((c) => c !== input.value));
    return;
  }

  if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
    // Con la lista abierta, las flechas son suyas. Antes iban siempre al
    // historial: ↓ pasaba del final, ponía '' en el campo y cerraba la lista,
    // y lo escrito se perdía.
    if (lv) {
      ev.preventDefault();
      // Da la vuelta pasando por «ninguna» (-1, el texto original): así se
      // puede volver a lo que se escribió sin salir con Escape.
      const n = lvOpciones.length;
      seleccionar(ev.key === 'ArrowDown' ? (lvSel + 1 >= n ? -1 : lvSel + 1) : lvSel - 1 < -1 ? n - 1 : lvSel - 1);
      return;
    }
    if (!historial.length) return;
    ev.preventDefault();
    if (ev.key === 'ArrowUp') {
      // Al empezar a recorrer el historial se guarda lo que había escrito.
      if (hIdx === historial.length) borrador = input.value;
      hIdx = Math.max(0, hIdx - 1);
    } else {
      // ↓ sin haber subido no tiene a dónde ir: no toca el campo.
      if (hIdx === historial.length) return;
      hIdx = hIdx + 1;
    }
    // Pasar de la entrada más reciente devuelve el borrador, nunca ''.
    input.value = hIdx === historial.length ? (borrador ?? '') : historial[hIdx];
    if (hIdx === historial.length) borrador = null;
    sincronizar();
    return;
  }

  if (ev.key === 'Escape') {
    // Cerrar la lista deja en el campo lo que la persona había escrito, no la
    // opción que las flechas tuvieran marcada.
    if (lv && lvSel >= 0) {
      input.value = lvEscrito;
      sincronizar();
    }
    cerrarListView();
  }
});

function prefijoComun(xs: string[]): string {
  if (!xs.length) return '';
  let p = xs[0];
  for (const x of xs) {
    while (!x.startsWith(p)) p = p.slice(0, -1);
  }
  return p;
}

// ── Clics ──────────────────────────────────────────────────────────────────

document.addEventListener('click', (ev) => {
  const t = ev.target;
  if (!(t instanceof Element)) return;

  // Un enlace interno a una sección se navega sin recargar. El resto —clic del
  // medio, otra pestaña, enlaces externos— sigue su camino normal.
  const a = t.closest('a');
  if (a) {
    const mouse = ev as MouseEvent;
    if (mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.button !== 0) return;
    const href = a.getAttribute('href') ?? '';
    const destino = href.startsWith('/') ? href.slice(1) : null;
    if (destino !== null && SECCIONES.includes(destino) && indice) {
      ev.preventDefault();
      escribirComando('cd ' + destino);
      navegar(destino);
      prompt();
    }
    return;
  }

  const panel = t.closest<HTMLElement>('.panel[data-go]');
  if (panel && !getSelection()?.toString()) {
    const destino = panel.dataset.go;
    if (destino) location.href = destino;
    return;
  }

  const l = t.closest('.inputline');
  if (!l) {
    if (!TOUCH && !getSelection()?.toString() && t.closest('#term')) input.focus();
    return;
  }
  l.classList.add('typing');
  input.focus();
  setTimeout(
    () => l.scrollIntoView({ block: 'end', behavior: reducido.matches ? 'auto' : 'smooth' }),
    320,
  );
});

/** Deja el comando escrito en el prompt vivo, como si se hubiera tecleado. */
function escribirComando(cmd: string) {
  if (!live) return;
  live.node.querySelector('.caret')?.remove();
  live.node.querySelector('.tap-hint')?.remove();
  live.typed.textContent = cmd;
  live = null;
  recordar(cmd);
}

// ── Teclado global ─────────────────────────────────────────────────────────

document.addEventListener('keydown', (ev) => {
  if (!ev.altKey || ev.ctrlKey || ev.metaKey) return;
  const i = Number(ev.key) - 1;
  if (i >= 0 && i < SECCIONES.length) {
    ev.preventDefault();
    escribirComando('cd ' + SECCIONES[i]);
    navegar(SECCIONES[i]);
    prompt();
  }
});

// Las teclas del final de un artículo salen del propio HTML: cada salida lleva
// su <kbd> escrito. Declarar la tecla en el botón y otra vez acá es cómo dejan
// de coincidir.
const salidas = new Map<string, string>();
document.querySelectorAll('.eof-acts a').forEach((a) => {
  const k = a.querySelector('kbd');
  const href = a.getAttribute('href');
  if (k?.textContent && href) salidas.set(k.textContent.trim().toLowerCase(), href);
});

if (salidas.size) {
  document.addEventListener('keydown', (ev) => {
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
    // Si hay algo escrito en el prompt, la tecla es parte del comando.
    if (input.value !== '') return;
    const href = salidas.get(ev.key.toLowerCase());
    if (!href) return;
    ev.preventDefault();
    location.href = href;
  });
}

// ── Atrás y adelante ───────────────────────────────────────────────────────
// Sin esto, el botón «atrás» del navegador saldría del sitio después de
// navegar sin recargar: es la queja clásica contra este tipo de páginas.

addEventListener('popstate', (ev) => {
  const estado = ev.state as { seccion?: string } | null;
  const destino = estado?.seccion ?? rutaActual();
  if (destino !== null) navegar(destino, false);
  else location.reload();
});

/** La sección de la URL actual, o null si es una página que no renderizamos. */
function rutaActual(): string | null {
  const p = location.pathname.replace(/^\/+|\/+$/g, '');
  if (p === '') return '';
  return SECCIONES.includes(p) ? p : null;
}

// El estado inicial también entra al historial: sin él, el primer «atrás»
// después de navegar no tendría a dónde volver.
history.replaceState({ seccion: aqui }, '', location.pathname);

// ── Viewport ───────────────────────────────────────────────────────────────
// Solo cuando el teclado achica de verdad: aplicado siempre rompe el layout,
// porque fuera de ese caso el alto reportado no es el del marco.

if (window.visualViewport) {
  const vv = window.visualViewport;
  const ajustar = () => {
    const hueco = window.innerHeight - vv.height;
    document.documentElement.style.setProperty('--vh', hueco > 120 ? vv.height + 'px' : '100dvh');
  };
  vv.addEventListener('resize', ajustar);
  ajustar();
}

// ── Reloj ──────────────────────────────────────────────────────────────────

const reloj = () => {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};

if (stClock) {
  const tic = () => (stClock.textContent = reloj());
  tic();
  setInterval(tic, 20000);
}

// ── Arranque ───────────────────────────────────────────────────────────────

prompt();
arrancarAnimado();
entrarPagina();

// De acá en adelante cada salida es consecuencia de algo que alguien hizo, así
// que sí corresponde llevarlo a verla.
arrancando = false;

// El índice llega después del primer pintado: la página ya es legible sin él y
// solo hace falta cuando alguien navega o completa con Tab.
fetch('/indice.json')
  .then((r) => (r.ok ? (r.json() as Promise<Indice>) : null))
  .then((datos) => {
    indice = datos;
  })
  .catch(() => {
    // Sin índice la terminal sigue funcionando: cada comando cae a una
    // navegación normal y el servidor renderiza igual.
    indice = null;
  });
