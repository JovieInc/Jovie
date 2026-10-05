"""Jovie mark + wordmark construction (JOV-7760).

One parametric source for the O mark and the "Jovie" lettering. Every letter is
derived from the O: stroke weights, contrast, curve radii and terminals all come
from the ring below. The script builds real font outlines (fontTools), spaces
them optically, and emits the font, master SVGs, small-size pixel masters and
the TypeScript geometry the React primitives render.

Run from the repo root (needs fonttools, skia-pathops, brotli):

    python3 packages/brand/font/construction.py
    python3 packages/brand/font/sheet.py
    pnpm exec biome format --write packages/brand/dist/geometry.json \
        packages/ui/brand/geometry.gen.ts

The unit test packages/ui/brand/jovie-o-geometry.test.ts fails if the
TypeScript geometry drifts from dist/geometry.json.

Coordinates are font units: UPM 1000, baseline y=0, y up.
"""

from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass
from pathlib import Path

import pathops
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen

# Fixed font timestamps so regenerating without a change leaves the binaries
# byte-identical (fontTools honours SOURCE_DATE_EPOCH).
os.environ.setdefault('SOURCE_DATE_EPOCH', '1791072000')  # 2026-10-04

HERE = Path(__file__).resolve().parent
PKG = HERE.parent
REPO = PKG.parent.parent
WEB_FONTS = REPO / 'apps' / 'web' / 'public' / 'fonts'

# ---------------------------------------------------------------------------
# 1. The grid. Everything below is a function of these numbers.
# ---------------------------------------------------------------------------

UPM = 1000
XH = 520  # x-height. 0.743 of cap height: a large, friendly x-height.
CAP = 700  # cap height (J).
OS = 12  # overshoot of round forms past baseline / x-height (2.3% of XH).

# The O. A true circle on its outside; the optical correction lives inside.
R = (XH + 2 * OS) / 2  # 272: outer radius, spans -OS .. XH+OS.
# Counter ratio 0.45 is the existing mark's proportion (inner R 80.3 / outer
# R 176.8 on its 360 grid). Kept so the identity survives the rebuild.
COUNTER = 0.45
TS = round(R * (1 - COUNTER) * 1.0)  # 150: side (vertical) stroke of the ring.
# Horizontal strokes read heavier than vertical ones of equal width, so the
# ring is 3% thinner at 12 and 6 o'clock. The counter becomes a barely
# vertical oval and the ring *looks* even. (6% read as an egg in the mark.)
CONTRAST = 0.97
TH = round(TS * CONTRAST)  # 141

# Straight stems are drawn 4% lighter than the round ring's maximum so that
# straight and round strokes look the same weight.
S = round(TS / 1.04)  # 144

# The seam: a hairline that folds the top of the ring into a ball (the "seed").
# Display masters use a hairline; the text master opens it to ~1px at 16px.
SEAM_DISPLAY = 16
SEAM_TEXT = 46

# Optical spacing (area method, see space()). Straight-sided sidebearing.
STRAIGHT_SB = 54
SPACING_DEPTH = 0.22 * XH  # how far into an open shape the white is counted

KAPPA = 0.5522847498


@dataclass
class Master:
    name: str
    seam: float
    sb_extra: float  # added to every sidebearing (looser text setting)


MASTERS = [
    Master('Display', SEAM_DISPLAY, 0),
    Master('Text', SEAM_TEXT, 10),
]

# ---------------------------------------------------------------------------
# 2. Path helpers (skia-pathops for exact booleans).
# ---------------------------------------------------------------------------


def ellipse(cx: float, cy: float, rx: float, ry: float) -> pathops.Path:
    p = pathops.Path()
    kx, ky = rx * KAPPA, ry * KAPPA
    p.moveTo(cx + rx, cy)
    p.cubicTo(cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry)
    p.cubicTo(cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy)
    p.cubicTo(cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry)
    p.cubicTo(cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy)
    p.close()
    return p


def poly(points) -> pathops.Path:
    p = pathops.Path()
    p.moveTo(*points[0])
    for pt in points[1:]:
        p.lineTo(*pt)
    p.close()
    return p


def rect(x0, y0, x1, y1) -> pathops.Path:
    return poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])


def op(a, b, kind) -> pathops.Path:
    return pathops.op(a, b, kind, fix_winding=True, keep_starting_points=False)


U, D, I = pathops.PathOp.UNION, pathops.PathOp.DIFFERENCE, pathops.PathOp.INTERSECTION


def union(*paths):
    out = paths[0]
    for p in paths[1:]:
        out = op(out, p, U)
    return out


# ---------------------------------------------------------------------------
# 3. Glyph construction. Each returns a path whose ink starts at x=0.
# ---------------------------------------------------------------------------


def ring(cx, cy, rx, ry, ts, th):
    return op(ellipse(cx, cy, rx, ry), ellipse(cx, cy, rx - ts, ry - th), D)


def seam_cut(cx, cy, seam):
    """The fold at 12 o'clock.

    A ball of diameter = ring thickness sits on the ring's midline at the top.
    The seam is a half-annulus of width `seam`, concentric with that ball, on
    its right. Cutting it out of the ring leaves the ball as the ring's start
    terminal, so the O reads as one stroke that curls in on itself.
    """
    top, inner_top = cy + R, cy + (R - TH)
    lobe_r = (top - inner_top) / 2
    lobe_cy = (top + inner_top) / 2
    band = op(ellipse(cx, lobe_cy, lobe_r + seam, lobe_r + seam), ellipse(cx, lobe_cy, lobe_r, lobe_r), D)
    return op(band, rect(cx, lobe_cy - 400, cx + 400, lobe_cy + 400), I), (lobe_cy, lobe_r)


def glyph_o(seam: float):
    cx, cy = R, XH / 2
    body = ring(cx, cy, R, R, TS, TH)
    if seam <= 0:
        return body
    cut, _ = seam_cut(cx, cy, seam)
    return op(body, cut, D)


J_R = round(R * 0.86)  # hook radius: the O's bowl, narrowed for a cap letter.


def glyph_J():
    # The hook is the lower half of an O ring (same contrast), its right side
    # flush with the stem so the curve flows into the straight without a kink.
    rx = J_R
    cx, cy = rx, J_R - OS
    hook = op(ring(cx, cy, rx, J_R, S, TH), rect(-10, cy - 400, 2 * rx + 10, cy), I)
    stem = rect(2 * rx - S, cy, 2 * rx, CAP)
    return union(hook, stem)  # terminal: radial cut at 9 o'clock (horizontal)


V_W = 520
V_FOOT = round(S * 0.42)  # flat vertex keeps the heavy join from clogging
V_STROKE = round(S * 0.93)  # diagonals read heavier, so they are drawn lighter


def glyph_v():
    w, foot, t = V_W, V_FOOT, V_STROKE
    # outer edge: (0, XH) -> (w/2 - foot/2, 0)
    x_b = w / 2 - foot / 2
    ang = math.atan2(x_b, XH)  # angle from vertical
    top_w = t / math.cos(ang)  # horizontal width of the stroke at the top
    # inner edges meet at the crotch
    x_in_top = top_w
    slope = x_b / XH  # dx per dy
    # inner left edge: x = x_in_top + slope * (XH - y); meets x = w/2 at:
    y_crotch = XH - (w / 2 - x_in_top) / slope
    return poly([
        (0, XH), (top_w, XH), (w / 2, y_crotch), (w - top_w, XH), (w, XH),
        (w - x_b, 0), (x_b, 0),
    ])


DOT_D = S  # a round dot already reads larger than a square one of equal width
DOT_GAP = 52  # dot top lands at CAP + 16: the round overshoot above the J


def glyph_i():
    stem = rect(0, 0, S, XH)
    cx = S / 2
    cy = XH + DOT_GAP + DOT_D / 2
    return union(stem, ellipse(cx, cy, DOT_D / 2, DOT_D / 2))


E_RX = round(R * 0.965)  # e is optically narrower than o
# The e carries the most horizontals in the word, so it takes the strongest
# contrast: top/bottom 0.83 of the side stroke, bar 0.61. Without it the eye
# closes to a sliver at this weight.
E_TH = round(TS * 0.83)  # 124
E_BAR = round(TS * 0.61)  # 92
E_BAR_Y = 208  # eye (108) and lower counter (96) nearly equal; eye wins
E_TERMINAL = math.radians(-32)  # radial cut, lower right


def glyph_e():
    rx, cx, cy = E_RX, E_RX, XH / 2
    body = ring(cx, cy, rx, R, TS, E_TH)
    y0 = E_BAR_Y
    far = 900
    wedge = poly([
        (cx, y0), (cx + far, y0),
        (cx + far, cy + far * math.tan(E_TERMINAL)), (cx, cy),
    ])
    body = op(body, wedge, D)
    bar = op(rect(cx - rx + 1, y0, cx + rx, y0 + E_BAR), ellipse(cx, cy, rx, R), I)
    return union(body, bar)


# ---------------------------------------------------------------------------
# 4. Optical spacing.
# ---------------------------------------------------------------------------


class _Flatten:
    def __init__(self):
        self.edges = []
        self._p = None
        self._start = None

    def moveTo(self, p):
        self._p = self._start = p

    def lineTo(self, p):
        self.edges.append((self._p, p))
        self._p = p

    def curveTo(self, c1, c2, p):
        p0 = self._p
        prev = p0
        for k in range(1, 33):
            t = k / 32
            mt = 1 - t
            x = mt**3 * p0[0] + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t**3 * p[0]
            y = mt**3 * p0[1] + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t**3 * p[1]
            self.edges.append((prev, (x, y)))
            prev = (x, y)
        self._p = p

    def qCurveTo(self, c, p):
        # Skia quadratics use one control point. Exact degree elevation lets
        # them share the cubic sampler without changing contour geometry.
        p0 = self._p
        c1 = tuple(p0[i] + 2 * (c[i] - p0[i]) / 3 for i in (0, 1))
        c2 = tuple(p[i] + 2 * (c[i] - p[i]) / 3 for i in (0, 1))
        self.curveTo(c1, c2, p)

    def closePath(self):
        if self._p != self._start:
            self.edges.append((self._p, self._start))

    endPath = closePath


def profile(path, ys):
    f = _Flatten()
    path.draw(f)
    out = []
    for y in ys:
        xs = []
        for (x0, y0), (x1, y1) in f.edges:
            if (y0 <= y < y1) or (y1 <= y < y0):
                xs.append(x0 + (y - y0) * (x1 - x0) / (y1 - y0))
        out.append((min(xs), max(xs)) if xs else None)
    return out


def bounds(path):
    return path.bounds  # (xMin, yMin, xMax, yMax)


def space(path, extra):
    """Area-based optical sidebearings.

    For each side, measure the white that the outline leaves inside the
    x-height band (from the glyph's outermost point inward, clipped at
    SPACING_DEPTH so open shapes do not count their whole counter). A straight
    stem leaves none. Each side then gets STRAIGHT_SB minus its own white, so
    every adjacent pair encloses the same area of white as two stems do.
    """
    ys = [XH * (k + 0.5) / 120 for k in range(120)]
    prof = profile(path, ys)
    xmin, _, xmax, _ = bounds(path)
    left = right = 0.0
    for p in prof:
        if p is None:
            left += SPACING_DEPTH
            right += SPACING_DEPTH
            continue
        left += min(p[0] - xmin, SPACING_DEPTH)
        right += min(xmax - p[1], SPACING_DEPTH)
    left /= len(ys)
    right /= len(ys)
    return STRAIGHT_SB - left + extra, STRAIGHT_SB - right + extra


# Optical kerning on top of the area spacing, in font units. Area spacing gets
# pairs to within a few units; these fix what the eye still sees.
#   J/o: J's stem faces the o's round side; area method already balances it.
#   o/v: the v's open top over-counts white; pull 6 units.
KERN = {('i', 'e'): -10}

# ---------------------------------------------------------------------------
# 5. Build.
# ---------------------------------------------------------------------------

NAMES = {'J': 'J', 'o': 'o', 'v': 'v', 'i': 'i', 'e': 'e'}
WORD = ['J', 'o', 'v', 'i', 'e']


def shift(path, dx):
    rec = RecordingPen()
    path.draw(TransformPen(rec, (1, 0, 0, 1, dx, 0)))
    p = pathops.Path()
    rec.replay(p.getPen())
    return p


def build_master(m: Master):
    shapes = {
        'J': glyph_J(),
        'o': glyph_o(m.seam),
        'v': glyph_v(),
        'i': glyph_i(),
        'e': glyph_e(),
    }
    glyphs = {}
    for name, shape in shapes.items():
        xmin, _, xmax, _ = bounds(shape)
        lsb, rsb = space(shape, m.sb_extra)
        placed = shift(shape, lsb - xmin)
        glyphs[name] = {
            'path': placed,
            'advance': round(lsb + (xmax - xmin) + rsb),
            'lsb': round(lsb),
            'rsb': round(rsb),
        }
    return glyphs


def write_font(m: Master, glyphs, out_dir: Path):
    order = ['.notdef', 'space', 'mark'] + WORD
    fb = FontBuilder(UPM, isTTF=False)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({0x20: 'space', 0xE000: 'mark', **{ord(n): n for n in WORD}})
    charstrings, metrics = {}, {}
    for name in order:
        pen = T2CharStringPen(0, None)
        if name in glyphs:
            glyphs[name]['path'].draw(pen)
            adv = glyphs[name]['advance']
            lsb = glyphs[name]['lsb']
        elif name == 'mark':
            # the standalone mark: the display o, centered on a square advance
            o = glyph_o(SEAM_DISPLAY)
            shift(o, (CAP - 2 * R) / 2).draw(pen)
            adv, lsb = CAP, round((CAP - 2 * R) / 2)
        elif name == 'space':
            adv, lsb = round(S * 1.6), 0
        else:
            adv, lsb = 500, 0
        charstrings[name] = pen.getCharString()
        metrics[name] = (adv, lsb)
    family = 'Jovie Wordmark'
    fb.setupCFF(f'JovieWordmark-{m.name}', {'FullName': f'{family} {m.name}'}, charstrings, {})
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=900, descent=-200)
    fb.setupNameTable({'familyName': family, 'styleName': m.name, 'psName': f'JovieWordmark-{m.name}'})
    fb.setupOS2(sTypoAscender=900, sTypoDescender=-200, usWinAscent=900, usWinDescent=200,
                sxHeight=XH, sCapHeight=CAP)
    fb.setupPost()
    # kerning via GPOS
    fea = 'languagesystem DFLT dflt;\nfeature kern {\n' + ''.join(
        f'  pos {a} {b} {v};\n' for (a, b), v in KERN.items()) + '} kern;\n'
    from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
    addOpenTypeFeaturesFromString(fb.font, fea)
    out_dir.mkdir(parents=True, exist_ok=True)
    otf = out_dir / f'JovieWordmark-{m.name}.otf'
    fb.save(otf)
    # The web font ships from the app's public fonts, next to Inter and
    # Satoshi; the OTF (for design tools) stays an untracked build output.
    fb.font.flavor = 'woff2'
    fb.save(WEB_FONTS / f'JovieWordmark-{m.name}.woff2')
    return otf


def svg_d(path, dy_top, scale=1.0, dx=0.0):
    """Path data in SVG space (y down), top of the art box at y=0."""
    pen = SVGPathPen(None, ntos=lambda v: f'{round(v, 2):g}')
    path.draw(TransformPen(pen, (scale, 0, 0, -scale, dx * scale, dy_top * scale)))
    return pen.getCommands()


def layout(glyphs):
    x, placed = 0, []
    for i, n in enumerate(WORD):
        placed.append((n, x))
        x += glyphs[n]['advance']
        if i + 1 < len(WORD):
            x += KERN.get((n, WORD[i + 1]), 0)
    return placed, x


# ---------------------------------------------------------------------------
# 6. Pixel masters for the standalone mark (16 / 24 / 32 px).
# ---------------------------------------------------------------------------

# Hand-snapped so every tangent edge lands on a whole pixel. Small sizes open
# the counter (lighter ring) and widen the seam to a full pixel so it survives.
PIXEL_MASTERS = {
    16: dict(ts=4, th=4, seam=1.5),
    24: dict(ts=6, th=6, seam=1.25),
    32: dict(ts=9, th=8, seam=1.25),
}


def o_master(size, ts, th, seam):
    """One O master on a `size` square, y down (SVG space).

    Returns the ring without its seam (the animated <JovieO> cuts the seam
    with a stroked mask so it can open, breathe and seal), the mark with the
    seam baked in (static uses), and the seed/seam geometry for that mask.
    """
    r = size / 2
    cx = cy = r
    body = op(ellipse(cx, cy, r, r), ellipse(cx, cy, r - ts, r - th), D)
    top, inner_top = cy + r, cy + (r - th)
    lobe_r = (top - inner_top) / 2
    lobe_cy = (top + inner_top) / 2
    band = op(ellipse(cx, lobe_cy, lobe_r + seam, lobe_r + seam), ellipse(cx, lobe_cy, lobe_r, lobe_r), D)
    cut = op(band, rect(cx, lobe_cy - size, cx + size, lobe_cy + size), I)
    mark = op(body, cut, D)
    nd = lambda v: round(v, 4)
    return {
        'size': size,
        # Primitive parameters: <JovieO> draws the mark live from these
        # (outer disc, counter ellipse, seam arc) so every part can move.
        'r': nd(r),
        'ts': nd(ts),
        'th': nd(th),
        'ring': svg_d(body, dy_top=size),
        'mark': svg_d(mark, dy_top=size),
        'seed': {'cx': nd(cx), 'cy': nd(size - lobe_cy), 'r': nd(lobe_r)},
        'seam': nd(seam),
    }


def o_masters():
    """Pixel masters at 16/24/32 and the display master on a 100 square."""
    k = 100 / (2 * R)
    masters = {str(px): o_master(px, **p) for px, p in PIXEL_MASTERS.items()}
    masters['display'] = o_master(100, TS * k, TH * k, SEAM_DISPLAY * k)
    masters['text'] = o_master(100, TS * k, TH * k, SEAM_TEXT * k)
    return masters


def ov_geometry():
    """Ovie's OV: the display o and v set as a pair, y down, top at 0.

    The o is described by its master parameters (it is the same <JovieO>); the
    v is its outer quad plus the notch triangle, so the notch can close like a
    lid when the pair blinks.
    """
    glyphs = build_master(MASTERS[0])
    o_adv = glyphs['o']['advance']
    o_rsb = glyphs['o']['rsb']
    v_lsb = glyphs['v']['lsb']
    top = XH + OS
    k = 100 / (2 * R)  # o master units per font unit
    w, foot, t = V_W, V_FOOT, V_STROKE
    x_b = w / 2 - foot / 2
    top_w = t / math.cos(math.atan2(x_b, XH))
    y_crotch = XH - (w / 2 - top_w) / (x_b / XH)
    # v origin: o's ink box starts at 0, so v starts after o ink + o rsb + v lsb
    vx = 2 * R + o_rsb + v_lsb
    yy = lambda y: round((top - y) * k, 3)
    xx = lambda x: round((vx + x) * k, 3)
    return {
        'viewBox': [0, 0, round((vx + w) * k, 3), 100],
        'o': {'x': 0, 'y': 0, 'size': 100},
        'v': {
            'outer': [[xx(0), yy(XH)], [xx(w), yy(XH)], [xx(w - x_b), yy(0)], [xx(x_b), yy(0)]],
            'notch': [[xx(top_w), yy(XH)], [xx(w - top_w), yy(XH)], [xx(w / 2), yy(y_crotch)]],
        },
    }


INKS = {'ink': '#08090A', 'cream': '#F5F4F0', 'black': '#000000', 'white': '#FFFFFF'}


def write_svgs(geometry):
    out = PKG / 'svg'
    out.mkdir(exist_ok=True)
    head = "<svg xmlns='http://www.w3.org/2000/svg' role='img' aria-label='Jovie'"
    o = geometry['o']
    for ink, hexv in INKS.items():
        d = o['display']
        (out / f'jovie-mark-{ink}.svg').write_text(
            f"{head} viewBox='0 0 100 100'><title>Jovie</title><path fill='{hexv}' d='{d['mark']}'/></svg>\n")
        for master in ('display', 'text'):
            w = geometry['wordmark'][master]
            vb = ' '.join(str(v) for v in w['viewBox'])
            paths = ''.join(f"<path d='{g['d']}'/>" for g in w['glyphs'])
            suffix = '' if master == 'display' else '-text'
            (out / f'jovie-wordmark{suffix}-{ink}.svg').write_text(
                f"{head} viewBox='{vb}'><title>Jovie</title><g fill='{hexv}'>{paths}</g></svg>\n")
    for px in ('16', '24', '32'):
        (out / f'jovie-mark-{px}px.svg').write_text(
            f"{head} width='{px}' height='{px}' viewBox='0 0 {px} {px}'><title>Jovie</title>"
            f"<path fill='{INKS['ink']}' d='{o[px]['mark']}'/></svg>\n")


def write_ts(geometry):
    """Geometry the React primitives in packages/ui/brand render."""
    target = REPO / 'packages' / 'ui' / 'brand' / 'geometry.gen.ts'
    target.parent.mkdir(exist_ok=True)
    body = json.dumps({k: geometry[k] for k in ('grid', 'o', 'ov', 'wordmark')}, indent=2)
    target.write_text(
        '// GENERATED by packages/brand/font/construction.py. Do not edit.\n'
        '// Re-run: python3 packages/brand/font/construction.py (then biome format)\n\n'
        f'export const JOVIE_BRAND_GEOMETRY = {body} as const;\n'
    )


def main():
    out = {}
    for m in MASTERS:
        glyphs = build_master(m)
        write_font(m, glyphs, PKG / 'dist')
        placed, width = layout(glyphs)
        top = max(bounds(glyphs[n]['path'])[3] for n in WORD)
        bottom = min(bounds(glyphs[n]['path'])[1] for n in WORD)
        first_lsb = glyphs['J']['lsb']
        last_rsb = glyphs['e']['rsb']
        art_w = width - first_lsb - last_rsb
        out[m.name.lower()] = {
            'viewBox': [0, 0, round(art_w, 2), round(top - bottom, 2)],
            'baseline': round(top, 2),
            'xHeight': XH,
            'capHeight': CAP,
            'glyphs': [
                {
                    'char': n,
                    'x': round(x - first_lsb, 2),
                    'advance': glyphs[n]['advance'],
                    'd': svg_d(glyphs[n]['path'], dy_top=top, dx=x - first_lsb),
                    'bounds': [round(v, 2) for v in bounds(glyphs[n]['path'])],
                }
                for n, x in placed
            ],
        }
    geometry = {
        'grid': {
            'upm': UPM, 'xHeight': XH, 'capHeight': CAP, 'overshoot': OS,
            'ringOuterRadius': R, 'ringSide': TS, 'ringTopBottom': TH,
            'counterRatio': COUNTER, 'contrast': CONTRAST, 'stem': S,
            'seamDisplay': SEAM_DISPLAY, 'seamText': SEAM_TEXT,
            'straightSidebearing': STRAIGHT_SB,
            'dot': DOT_D, 'dotGap': DOT_GAP, 'vFoot': V_FOOT, 'vStroke': V_STROKE,
            'eBar': E_BAR, 'jHookRadius': J_R,
        },
        'o': o_masters(),
        'ov': ov_geometry(),
        'wordmark': out,
    }
    (PKG / 'dist').mkdir(exist_ok=True)
    (PKG / 'dist' / 'geometry.json').write_text(json.dumps(geometry, indent=2) + '\n')
    write_svgs(geometry)
    write_ts(geometry)
    print(json.dumps(geometry['grid'], indent=2))
    for name, w in out.items():
        print(name, 'viewBox', w['viewBox'], [(g['char'], g['x'], g['advance']) for g in w['glyphs']])


if __name__ == '__main__':
    main()
