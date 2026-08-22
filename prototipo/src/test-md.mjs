/* Prueba el renderizador de Markdown del prototipo contra un DOM mínimo.
   No valida estilos: valida que cada bloque salga con la etiqueta correcta y
   que el texto no se pierda ni se duplique. */
import fs from 'node:fs';
import assert from 'node:assert';

const html = fs.readFileSync(
  'E:/JUNIOR/JBMLLNUBE/jbmll-web/prototipo/jbsh.html', 'utf8');
const js = html.split('<script>')[1].split('</scr' + 'ipt>')[0];

// DOM mínimo: solo lo que tocan inlineMd/renderMd.
class Node {
  constructor(tag, cls, txt) {
    this.tag = tag; this.cls = cls || '';
    this.children = []; this.dataset = {};
    if (txt != null) this.children.push({ tag: '#text', text: String(txt) });
  }
  append(...ns) { this.children.push(...ns); }
  get text() {
    if (this.tag === '#text') return this.text_;
    return this.children.map(c => c.tag === '#text' ? c.text : c.text).join('');
  }
}
const textNode = t => ({ tag: '#text', text: String(t) });

const sandbox = {
  document: { createElement: t => new Node(t), createTextNode: textNode },
  el: (tag, cls, txt) => new Node(tag, cls, txt),
};

// Extrae solo las dos funciones que queremos probar. El corte va hasta el
// siguiente bloque comentado; si se reordena el archivo, esta asercion avisa
// en vez de dejar entrar codigo que toca el DOM.
const start = js.indexOf('function inlineMd');
const end = js.indexOf('/* ── Navegación');
assert.ok(start > 0 && end > start, 'no encuentro las funciones de markdown');
const between = js.slice(start, end);
assert.ok(!between.includes('document.getElementById'),
  'el corte arrastro codigo que toca el DOM: revisa los marcadores');
const src = js.slice(start, end);

const factory = new Function('document', 'el',
  src + '\nreturn { inlineMd, renderMd };');
const { renderMd } = factory(sandbox.document, sandbox.el);

const tags = n => n.children.filter(c => c.tag !== '#text').map(c => c.tag);
const flat = n => n.tag === '#text' ? n.text
  : n.children.map(flat).join('');

let fails = 0;
const check = (name, fn) => {
  try { fn(); console.log('  ok   ' + name); }
  catch (e) { fails++; console.log('  FALLA ' + name + ' — ' + e.message); }
};

check('encabezados en los tres niveles', () => {
  const r = renderMd(['# Uno', '', '## Dos', '', '### Tres']);
  assert.deepStrictEqual(tags(r), ['h1', 'h2', 'h3']);
  assert.strictEqual(flat(r.children[0]), 'Uno');
});

check('parrafos: lineas contiguas se unen, la vacia separa', () => {
  const r = renderMd(['uno', 'dos', '', 'tres']);
  assert.deepStrictEqual(tags(r), ['p', 'p']);
  assert.strictEqual(flat(r.children[0]), 'uno dos');
  assert.strictEqual(flat(r.children[1]), 'tres');
});

check('bloque de codigo conserva saltos y no interpreta markdown', () => {
  const r = renderMd(['```js', 'const a = **no**;', 'let b;', '```']);
  assert.deepStrictEqual(tags(r), ['pre']);
  assert.strictEqual(r.children[0].dataset.lang, 'js');
  assert.strictEqual(flat(r.children[0]), 'const a = **no**;\nlet b;');
});

check('lista agrupa items contiguos en un solo ul', () => {
  const r = renderMd(['- a', '- b', '- c']);
  assert.deepStrictEqual(tags(r), ['ul']);
  assert.strictEqual(r.children[0].children.length, 3);
});

check('cita une lineas consecutivas', () => {
  const r = renderMd(['> uno', '> dos', '', 'suelto']);
  assert.deepStrictEqual(tags(r), ['blockquote', 'p']);
  assert.strictEqual(flat(r.children[0]), 'uno dos');
});

check('imagen sola produce figure con marco y pie', () => {
  const r = renderMd(['![Un pie](captura.png)']);
  assert.deepStrictEqual(tags(r), ['figure']);
  assert.strictEqual(flat(r.children[0]), '[ captura.png ]Un pie');
});

check('inline: codigo, negrita y enlace', () => {
  const r = renderMd(['texto `cod` y **fuerte** y [link](https://x.dev) fin']);
  const p = r.children[0];
  assert.deepStrictEqual(tags(p), ['code', 'strong', 'a']);
  assert.strictEqual(flat(p), 'texto cod y fuerte y link fin');
  const a = p.children.find(c => c.tag === 'a');
  assert.strictEqual(a.href, 'https://x.dev');
  assert.strictEqual(a.rel, 'noopener noreferrer');
});

check('regla horizontal', () => {
  const r = renderMd(['a', '', '---', '', 'b']);
  assert.deepStrictEqual(tags(r), ['p', 'hr', 'p']);
});

check('los articulos reales del prototipo se renderizan enteros', () => {
  const treeSrc = js.slice(js.indexOf('const TREE ='), js.indexOf('const SECTIONS'));
  const TREE = new Function(treeSrc + '\nreturn TREE;')();
  let n = 0;
  for (const sec of Object.values(TREE)) {
    for (const it of (sec.items || [])) {
      if (!it.md) continue;
      const r = renderMd(it.md);
      assert.ok(r.children.length > 5, it.n + ': salieron muy pocos bloques');
      // La prosa no debe tener sintaxis sin parsear. Los bloques de codigo si:
      // el articulo de dotfiles muestra `[...](fg:green)` de starship a proposito.
      const prosa = r.children.filter(c => c.tag !== 'pre').map(flat).join('');
      assert.ok(!prosa.includes('```'), it.n + ': quedo una cerca sin cerrar');
      assert.ok(!prosa.includes(']('), it.n + ': quedo un enlace sin parsear');
      assert.ok(!/\*\*/.test(prosa), it.n + ': quedo una negrita sin parsear');
      assert.ok(!/(^|\s)#{1,3}\s/.test(prosa), it.n + ': quedo un encabezado sin parsear');
      n++;
    }
  }
  assert.strictEqual(n, 2, 'esperaba 2 articulos con cuerpo, encontre ' + n);
});

console.log(fails ? '\n' + fails + ' FALLAS' : '\ntodo verde');
process.exit(fails ? 1 : 0);
