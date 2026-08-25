# Regenera las fuentes recortadas.
#
# El sitio empaqueta su propia Fira Code Nerd Font porque el glifo del prompt y
# los logos de tecnología viven en el Área de Uso Privado: sin la fuente serían
# cuadrados vacíos en cualquier equipo que no sea el mío.
#
# Recortar no es opcional. La Nerd Font completa pesa varios megabytes; el
# subconjunto que este sitio necesita cabe en unas decenas de kilobytes.
#
#   python scripts/fuente.py
#
# Requiere fontTools y la Nerd Font instalada. No se ejecuta en la compilación:
# las fuentes son artefactos versionados y solo se regeneran cuando cambia lo
# que hay que dibujar.

import io
import os
import re
import sys

ORIGEN = os.path.expanduser(
    r'~\AppData\Local\Microsoft\Windows\Fonts\FiraCodeNerdFont-%s.ttf'
)
DESTINO = 'public/fonts/jb-%s.woff2'
PESOS = [('Regular', 'Regular'), ('Bold', 'Bold')]


def codepoints_del_codigo():
    """Los escapes \\uXXXX que declara src/data/iconos.ts.

    Se leen del código y no de una lista aparte: una lista que hay que
    actualizar a mano es una lista que se queda vieja, y el síntoma sería un
    cuadrado vacío en producción.
    """
    fuente = io.open('src/data/iconos.ts', encoding='utf-8').read()
    return {int(m, 16) for m in re.findall(r"\\u([0-9A-Fa-f]{4})", fuente)}


def codepoints_actuales():
    """Lo que ya cubre la fuente recortada, para no perder ningún glifo."""
    from fontTools.ttLib import TTFont

    f = TTFont(DESTINO % 'Regular')
    cps = set()
    for t in f['cmap'].tables:
        cps |= set(t.cmap.keys())
    return cps


def main():
    from fontTools import subset

    faltan = [p for _, p in PESOS if not os.path.exists(ORIGEN % p)]
    if faltan:
        sys.exit('No encuentro la Nerd Font instalada: ' + ', '.join(faltan))

    cps = codepoints_actuales() | codepoints_del_codigo()
    unicodes = ','.join('U+%04X' % c for c in sorted(cps))
    print('%d glifos' % len(cps))

    for destino, origen in PESOS:
        args = [
            ORIGEN % origen,
            '--unicodes=' + unicodes,
            # Las ligaduras contextuales son parte de cómo se ve Fira Code.
            '--layout-features=+calt,+liga',
            '--flavor=woff2',
            '--output-file=' + (DESTINO % destino),
        ]
        subset.main(args)
        kb = os.path.getsize(DESTINO % destino) / 1024
        print('  %s  %.1f KB' % (DESTINO % destino, kb))


if __name__ == '__main__':
    main()
