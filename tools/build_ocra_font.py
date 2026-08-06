#!/usr/bin/env python3
"""Build the OCR-A LEIP data face.

An ORIGINAL digitization of the OCR-A character model (the typeface
defined by ANSI X3.17-1977 / ISO 1073-1), drawn from scratch as stroke
geometry in this script. It deliberately does NOT derive from the
CTAN/METAFONT lineage (Lillqvist -> Wales -> Skala), whose files carry
Richard B. Wales' 1988 "may not be distributed for profit" notice and
are therefore not freely licensed. Typeface shapes themselves are not
copyrightable; this implementation is released under CC0 1.0 (see
fonts/LICENSE-OCR-A-LEIP.txt).

Coverage: the game's data voice only — digits, capitals, and chart
punctuation. Lowercase maps to the capital glyphs.

Output: fonts/leip-ocra.woff2
"""
import os
import sys

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

UPM = 1000
ADV = 620            # monospaced advance
T = 105              # stroke thickness
CAP = 700            # cap height
XL, XR = 70, 550     # glyph box
XC = (XL + XR) // 2

# ---------------------------------------------------------------- shapes

def _rect(x1, y1, x2, y2):
    return [(x1, y1), (x2, y1), (x2, y2), (x1, y2)]

def H(y, x1=XL, x2=XR, t=T):
    return _rect(x1, y - t // 2, x2, y + t // 2)

def V(x, y1=0, y2=CAP, t=T):
    return _rect(x - t // 2, y1, x + t // 2, y2)

def Dg(x1, y1, x2, y2, t=T):
    """Diagonal bar with roughly constant visual thickness."""
    import math
    dx, dy = x2 - x1, y2 - y1
    ln = math.hypot(dx, dy) or 1.0
    nx, ny = -dy / ln * t / 2, dx / ln * t / 2
    return [(x1 + nx, y1 + ny), (x2 + nx, y2 + ny), (x2 - nx, y2 - ny), (x1 - nx, y1 - ny)]

def oct_pts(x1, y1, x2, y2, ch):
    """Chamfered rectangle (the OCR-A rounded-square feel)."""
    return [(x1 + ch, y1), (x2 - ch, y1), (x2, y1 + ch), (x2, y2 - ch),
            (x2 - ch, y2), (x1 + ch, y2), (x1, y2 - ch), (x1, y1 + ch)]

def Ring(x1, y1, x2, y2, ch=120, t=T):
    """Chamfered ring: outer octagon + its counter, tagged as a hole."""
    ich = max(20, ch - t)
    return [oct_pts(x1, y1, x2, y2, ch),
            ('hole', oct_pts(x1 + t, y1 + t, x2 - t, y2 - t, ich))]

def Bowl(x1, y1, x2, y2, opening, ch=120, t=T):
    """Ring with one side removed: opening in n/e/s/w."""
    parts = []
    if opening != 'n':
        parts.append(H(y2 - t // 2, x1 + (0 if opening != 'w' else 0), x2))
    if opening != 's':
        parts.append(H(y1 + t // 2, x1, x2))
    if opening != 'w':
        parts.append(V(x1 + t // 2, y1, y2))
    if opening != 'e':
        parts.append(V(x2 - t // 2, y1, y2))
    return parts

SMALL = 150   # dot size

# ---------------------------------------------------------------- glyphs
# Each entry: list of polygons (or lists of polygons flattened below).
G = {}

def _is_poly(p):
    """A polygon is a list of (x, y) number pairs."""
    return (isinstance(p, list) and p and isinstance(p[0], tuple)
            and len(p[0]) == 2 and isinstance(p[0][0], (int, float)))

def _is_hole(p):
    return isinstance(p, tuple) and len(p) == 2 and p[0] == 'hole'

def g(name, *parts):
    flat = []
    for p in parts:
        if _is_poly(p) or _is_hole(p):
            flat.append(p)
        elif isinstance(p, list):        # a list of parts (Ring/Bowl output)
            flat.extend(p)
    G[name] = flat

MID = 350   # midline

# Digits — the OCR-A model: chamfered bowls, flagged one, open four.
g('zero', Ring(XL, 0, XR, CAP, 170))
g('one',
  V(XC),
  Dg(XC - T * 1.4, CAP - T * 1.6, XC + T * 0.1, CAP - T * 0.35),   # top-left flag
  H(T // 2, XL + 40, XR - 40))                                     # wide base serif
g('two',
  H(CAP - T // 2, XL + 30, XR - 30), V(XR - T // 2, MID + 40, CAP - 30),
  Dg(XR - T // 2, MID + 60, XL + T // 2, T - 20), H(T // 2))
g('three',
  H(CAP - T // 2), Dg(XR - T // 2, CAP - 40, XC, MID + T // 2),
  H(MID, XC - 40, XR - 30), V(XR - T // 2, T, MID),
  H(T // 2, XL + 20, XR - 30))
g('four',
  V(XR - 120, 0, CAP),                    # right stem, full height
  V(XL + T // 2, MID, CAP),               # left arm upper half
  H(MID, XL, XR))                         # crossbar
g('five',
  H(CAP - T // 2), V(XL + T // 2, MID + 20, CAP),
  H(MID + 40, XL, XR - 60), V(XR - T // 2, T, MID + 40),
  H(T // 2, XL + 20, XR - 40))
g('six',
  Ring(XL, 0, XR, MID + 60, 130),
  V(XL + T // 2, MID, CAP - 60),
  Dg(XL + T // 2, CAP - 80, XC + 60, CAP - T // 3))
g('seven',
  H(CAP - T // 2), Dg(XR - T // 2, CAP - 40, XC - 60, 0))
g('eight', Ring(XL, MID - 40, XR, CAP, 120), Ring(XL, 0, XR, MID + 60, 120))
g('nine',
  Ring(XL, MID - 60, XR, CAP, 130),
  V(XR - T // 2, 60, MID),
  Dg(XR - T // 2, 80, XC - 60, T // 3))

# Capitals — rectilinear OCR-A blocks.
g('A', Bowl(XL, 0, XR, CAP, 's', t=T), H(MID - 60))
g('B', V(XL + T // 2), Ring(XL, MID - 40, XR - 30, CAP, 100), Ring(XL, 0, XR, MID + 60, 100))
g('C', H(CAP - T // 2, XL + 60, XR - 20), V(XL + T // 2, 90, CAP - 90),
      Dg(XL + T // 2, CAP - 110, XL + 130, CAP - T // 2), Dg(XL + T // 2, 110, XL + 130, T // 2),
      H(T // 2, XL + 60, XR - 20))
g('D', V(XL + T // 2), H(CAP - T // 2, XL, XR - 110), H(T // 2, XL, XR - 110),
      V(XR - T // 2, 130, CAP - 130),
      Dg(XR - 150, CAP - T // 2, XR - T // 2, CAP - 150), Dg(XR - 150, T // 2, XR - T // 2, 150))
g('E', V(XL + T // 2), H(CAP - T // 2), H(MID, XL, XR - 90), H(T // 2))
g('F', V(XL + T // 2), H(CAP - T // 2), H(MID, XL, XR - 90))
g('G', H(CAP - T // 2, XL + 50, XR - 20), V(XL + T // 2, 80, CAP - 80),
      Dg(XL + T // 2, 100, XL + 120, T // 2), H(T // 2, XL + 60, XR - T // 2 + 52),
      V(XR - T // 2, 0, MID - 40), H(MID - 40, XC + 20, XR))
g('H', V(XL + T // 2), V(XR - T // 2), H(MID))
g('I', V(XC), H(CAP - T // 2, XL + 60, XR - 60), H(T // 2, XL + 60, XR - 60))
g('J', V(XR - 160, 120, CAP), Bowl(XL + 20, 0, XR - 160 + T // 2, 260, 'n', t=T))
g('K', V(XL + T // 2), Dg(XL + T, MID - 40, XR - T // 3, CAP - T // 3), Dg(XL + T, MID - 40, XR - T // 3, T // 3))
g('L', V(XL + T // 2), H(T // 2))
g('M', V(XL + T // 2), V(XR - T // 2), Dg(XL + T // 2, CAP - T // 2, XC, MID), Dg(XC, MID, XR - T // 2, CAP - T // 2))
g('N', V(XL + T // 2), V(XR - T // 2), Dg(XL + T // 2, CAP - T // 2, XR - T // 2, T // 2))
g('O', Ring(XL, 0, XR, CAP, 150))
g('P', V(XL + T // 2), Ring(XL, MID - 60, XR, CAP, 110))
g('Q', Ring(XL, 0, XR, CAP, 150), Dg(XC + 20, 200, XR + 10, -30))
g('R', V(XL + T // 2), Ring(XL, MID - 60, XR, CAP, 110), Dg(XC - 30, MID - 40, XR - T // 3, T // 3))
g('S', H(CAP - T // 2, XL + 40, XR - 20), V(XL + T // 2, MID + 20, CAP - 60),
      H(MID + 40, XL + 20, XR - 40), V(XR - T // 2, 60, MID + 60),
      H(T // 2, XL + 20, XR - 40), Dg(XL + T // 2, 90, XL + 110, T // 2),
      Dg(XR - 110, CAP - T // 2, XR - T // 2, CAP - 90))
g('T', H(CAP - T // 2), V(XC))
g('U', V(XL + T // 2, 120, CAP), V(XR - T // 2, 120, CAP), Bowl(XL, 0, XR, 240, 'n', t=T))
g('V', Dg(XL + T // 2, CAP, XC, 0), Dg(XC, 0, XR - T // 2, CAP))
g('W', V(XL + T // 2, 0, CAP), V(XR - T // 2, 0, CAP), Dg(XL + T // 2, T // 2, XC, MID - 60), Dg(XC, MID - 60, XR - T // 2, T // 2))
g('X', Dg(XL + T // 2, CAP - T // 3, XR - T // 2, T // 3), Dg(XL + T // 2, T // 3, XR - T // 2, CAP - T // 3))
g('Y', Dg(XL + T // 2, CAP - T // 3, XC, MID), Dg(XR - T // 2, CAP - T // 3, XC, MID), V(XC, 0, MID + T // 2))
g('Z', H(CAP - T // 2), Dg(XR - T // 2, CAP - T + 20, XL + T // 2, T - 20), H(T // 2))

# Punctuation & chart symbols.
g('space')
g('period', _rect(XC - SMALL // 2, 0, XC + SMALL // 2, SMALL))
g('comma', _rect(XC - SMALL // 2, 60, XC + SMALL // 2, 60 + SMALL),
           Dg(XC, 80, XC - 90, -110, t=90))
g('colon', _rect(XC - SMALL // 2, 60, XC + SMALL // 2, 60 + SMALL),
           _rect(XC - SMALL // 2, CAP - 220, XC + SMALL // 2, CAP - 220 + SMALL))
g('slash', Dg(XL + 60, -40, XR - 60, CAP + 20))
g('hyphen', H(MID, XL + 60, XR - 60))
g('plus', H(MID, XL + 40, XR - 40), V(XC, MID - 200, MID + 200))
g('equal', H(MID + 110, XL + 50, XR - 50), H(MID - 110, XL + 50, XR - 50))
g('greater', Dg(XL + 70, CAP - 120, XR - 70, MID), Dg(XR - 70, MID, XL + 70, 120))
g('less', Dg(XR - 70, CAP - 120, XL + 70, MID), Dg(XL + 70, MID, XR - 70, 120))
g('percent', Ring(XL, CAP - 260, XL + 260, CAP, 70, t=90),
             Ring(XR - 260, 0, XR, 260, 70, t=90),
             Dg(XL + 70, 40, XR - 70, CAP - 40, t=90))
g('degree', Ring(XC - 130, CAP - 260, XC + 130, CAP, 70, t=90))
g('periodcentered', _rect(XC - SMALL // 2, MID - SMALL // 2, XC + SMALL // 2, MID + SMALL // 2))
g('quotesingle', V(XC, CAP - 240, CAP, t=95))
g('multiply', Dg(XL + 90, MID + 210, XR - 90, MID - 210), Dg(XL + 90, MID - 210, XR - 90, MID + 210))

CHARSET = {
    ' ': 'space', '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four',
    '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine',
    '.': 'period', ',': 'comma', ':': 'colon', '/': 'slash', '-': 'hyphen',
    '+': 'plus', '=': 'equal', '>': 'greater', '<': 'less', '%': 'percent',
    '°': 'degree', '·': 'periodcentered', "'": 'quotesingle', '×': 'multiply',
}
for c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ':
    CHARSET[c] = c
    CHARSET[c.lower()] = c    # lowercase renders as capitals

def main(out_path):
    glyph_order = ['.notdef'] + sorted(set(CHARSET.values()), key=lambda n: n)
    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap({ord(c): n for c, n in CHARSET.items()})

    glyphs = {}
    pen = TTGlyphPen(None)
    pen.moveTo((80, 0)); pen.lineTo((540, 0)); pen.lineTo((540, CAP)); pen.lineTo((80, CAP)); pen.closePath()
    pen2 = TTGlyphPen(None)
    pen2.moveTo((150, 70)); pen2.lineTo((470, 70)); pen2.lineTo((470, CAP - 70)); pen2.lineTo((150, CAP - 70)); pen2.closePath()
    glyphs['.notdef'] = pen.glyph()

    def signed_area(poly):
        s = 0.0
        for i in range(len(poly)):
            x1, y1 = poly[i]
            x2, y2 = poly[(i + 1) % len(poly)]
            s += x1 * y2 - x2 * y1
        return s / 2

    for name in glyph_order[1:]:
        pen = TTGlyphPen(None)
        # Nonzero winding: every filled stroke turns CCW; every declared
        # hole turns CW. Otherwise overlaps cancel into notches.
        for part in G.get(name, []):
            hole = _is_hole(part)
            poly = list(part[1]) if hole else list(part)
            a = signed_area(poly)
            if (a > 0) == hole:      # filled must be CCW (+), holes CW (−)
                poly.reverse()
            pen.moveTo(tuple(map(round, poly[0])))
            for pt in poly[1:]:
                pen.lineTo(tuple(map(round, pt)))
            pen.closePath()
        glyphs[name] = pen.glyph()

    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics({n: (ADV, 40) for n in glyph_order})
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=820, usWinDescent=220,
                achVendID='LEIP')
    fb.setupNameTable({
        'familyName': 'OCR-A-LEIP',
        'styleName': 'Regular',
        'fullName': 'OCR-A LEIP Regular',
        'psName': 'OCRALEIP-Regular',
        'version': 'Version 1.0',
        'copyright': 'Original OCR-A-model digitization for the LEIP charter game, 2026. '
                     'Released under CC0 1.0. Not derived from the CTAN/METAFONT lineage.',
        'licenseDescription': 'CC0 1.0 Universal. See fonts/LICENSE-OCR-A-LEIP.txt.',
    })
    fb.setupPost()
    fb.font.flavor = 'woff2'
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    fb.save(out_path)
    print(f'wrote {out_path} ({os.path.getsize(out_path)} bytes, {len(glyph_order)} glyphs)')

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'fonts', 'leip-ocra.woff2'))
