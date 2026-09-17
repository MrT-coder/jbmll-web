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
const nodoLead = document.querySelector<HTMLHeadingElement>('h1.lead');

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
  ['c', 'Limpiar la pantalla de esta sección'],
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
  for (const nodo of [...scroll.children]) if (nodo !== nodoLead) nodo.remove();
  const comando = seccion ? `cd ${seccion}` : 'ls';
  const linea = el('div', 'out done');
  linea.append(el('span', 'brain ok', BRAIN), el('span', 'typed', comando));
  push(linea);
  push(fragmento(seccion ? renderEntradas(indice.entradas[seccion] ?? []) : renderSecciones(indice.secciones)));

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
      // Limpia la pantalla de esta sección y la deja como recién entregada:
      // su encabezado, su comando y su salida. Antes volvía al inicio, y desde
      // otra ruta con una recarga completa, así que en el inicio parecía no
      // hacer nada y en una sección sacaba de donde estabas (lo reportó el
      // dueño del sitio). Una pantalla vacía de verdad tampoco sirve: en un
      // sitio web es un callejón sin salida. Donde no se puede volver a
      // renderizar —una página de detalle, o sin índice— se cae al inicio.
      //
      // La guarda del detalle no es opcional: sin ella, `c` en
      // /proyectos/<slug> pintaría la lista de proyectos dejando la URL del
      // documento, y la pantalla diría una cosa y la barra de direcciones otra.
      if (term.dataset.detalle !== '1' && indice) return navegar(aqui, false);
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
  scroll.innerHTML = pantallaInicial;
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

function cerrarListView() {
  lv?.remove();
  lv = null;
}

function abrirListView(opciones: string[]) {
  cerrarListView();
  if (!opciones.length || !live) return;
  const caja = el('div', 'lv');
  opciones.slice(0, 6).forEach((o) => {
    const fila = el('div', 'lv-i');
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
  term.scrollTop = term.scrollHeight;
}

const sincronizar = () => {
  if (live) live.typed.textContent = input.value;
};

// ── Entrada ────────────────────────────────────────────────────────────────

input.addEventListener('input', () => {
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
    if (!historial.length) return;
    ev.preventDefault();
    hIdx = ev.key === 'ArrowUp' ? Math.max(0, hIdx - 1) : Math.min(historial.length, hIdx + 1);
    input.value = historial[hIdx] ?? '';
    sincronizar();
    cerrarListView();
    return;
  }

  if (ev.key === 'Escape') {
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
  setTimeout(() => l.scrollIntoView({ block: 'end', behavior: 'smooth' }), 320);
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
