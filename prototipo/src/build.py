"""Arma prototipo/jbsh.html embebiendo las fuentes recortadas y el banner.

Uso:  python build.py

Las fuentes se recortan aparte con pyftsubset (ver README.md). Aca solo se
codifican a base64 y se inyectan, para que el HTML resultante sea un unico
archivo sin pedidos externos: se abre con doble clic y funciona offline.
"""
import base64
import io
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parent / 'jbsh.html'

BRAIN = chr(0xEE9C)  # glifo del prompt de starship (success_symbol / error_symbol)


def b64(name):
    return base64.b64encode((HERE / name).read_bytes()).decode('ascii')


def banner():
    """Lee el banner y RELLENA cada linea al ancho maximo.

    Los espacios finales son parte del dibujo, y cualquier editor con
    'trim trailing whitespace' los borra sin avisar. Rellenar al vuelo hace que
    el banner sobreviva a esa edicion en vez de romperse en silencio.
    """
    rows = (HERE / 'jbmll.txt').read_text(encoding='utf-8').rstrip('\n').split('\n')
    width = max(len(r) for r in rows)
    return '\n'.join(r.ljust(width) for r in rows), len(rows), width


art, rows, width = banner()

tpl = (HERE / 'jbsh.template.html').read_text(encoding='utf-8')

out = tpl
out = out.replace('__FONT_REGULAR__', b64('jb-Regular.woff2'))
out = out.replace('__FONT_BOLD__', b64('jb-Bold.woff2'))
out = out.replace('__BANNER__', json.dumps(art))

# El cerebro va como escape JS explicito: U+EE9C es Private Use Area, y crudo en
# el archivo es invisible en cualquier editor que no cargue la Nerd Font.
raw = 'const BRAIN = "' + BRAIN + '";'
esc = 'const BRAIN = "\\uEE9C";'
assert raw in out or esc in out, 'no encuentro la declaracion de BRAIN'
out = out.replace(raw, esc)

for tok in ('__FONT_REGULAR__', '__FONT_BOLD__', '__BANNER__'):
    assert tok not in out, 'sin reemplazar: ' + tok
assert esc in out, 'falta el cerebro'
assert BRAIN not in out, 'quedo un caracter PUA crudo'

# Documento completo. El viewport es el que mas duele si falta: sin el, un
# navegador movil finge 980px de ancho, encoge todo y ninguna media query ve
# la pantalla real. Se detecto abriendo el archivo en un iPhone SE emulado.
for tag in ('<!doctype html>', '<html lang="es">', '<meta charset="utf-8">',
            'name="viewport"', '</head>', '<body>', '</body>', '</html>'):
    assert tag in out, 'falta en el documento: ' + tag

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(out)
print(OUT, '->', round(len(out.encode('utf-8')) / 1024, 1), 'KB')
print('banner:', rows, 'lineas x', width, 'columnas')
