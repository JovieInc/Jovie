"""Render the construction sheet (packages/brand/svg/construction-sheet.svg).

Reads dist/geometry.json written by construction.py, so the sheet can never
disagree with the outlines it documents.
"""

from __future__ import annotations

import json
from pathlib import Path

PKG = Path(__file__).resolve().parent.parent
G = json.loads((PKG / 'dist' / 'geometry.json').read_text())
GRID = G['grid']

INK, CREAM, GUIDE, DIM, MUTED = '#08090A', '#F5F4F0', '#11AFFF', '#2A2C31', '#8D8D93'
FONT = "font-family='Satoshi, Helvetica Neue, Arial, sans-serif'"
W = 1600


def text(x, y, s, size=15, fill=MUTED, anchor='start', weight=500):
    return (f"<text x='{x}' y='{y}' {FONT} font-size='{size}' font-weight='{weight}' "
            f"fill='{fill}' text-anchor='{anchor}'>{s}</text>")


def line(x1, y1, x2, y2, color=GUIDE, w=1, dash=None):
    d = f" stroke-dasharray='{dash}'" if dash else ''
    return f"<line x1='{x1}' y1='{y1}' x2='{x2}' y2='{y2}' stroke='{color}' stroke-width='{w}'{d}/>"


def circle(cx, cy, rx, ry=None, color=GUIDE, w=1, dash=None):
    ry = rx if ry is None else ry
    d = f" stroke-dasharray='{dash}'" if dash else ''
    return f"<ellipse cx='{cx}' cy='{cy}' rx='{rx}' ry='{ry}' fill='none' stroke='{color}' stroke-width='{w}'{d}/>"


def wordmark(master, x, y, height, fill):
    w = G['wordmark'][master]
    s = height / w['viewBox'][3]
    paths = ''.join(f"<path d='{g['d']}'/>" for g in w['glyphs'])
    return f"<g transform='translate({x},{y}) scale({s})' fill='{fill}'>{paths}</g>", w['viewBox'][2] * s, s


def section(y, n, title, sub):
    return text(80, y, f'{n:02d}', 13, GUIDE, weight=700) + text(120, y, title, 22, CREAM, weight=700) + text(120, y + 26, sub, 15)


def mark_panel(y0):
    out = [section(y0, 1, 'The O', 'Every letter in the word is cut from this ring.')]
    size = 520
    cx, cy = 360, y0 + 90 + size / 2
    k = size / (2 * GRID['ringOuterRadius'])
    R = GRID['ringOuterRadius'] * k
    rx_i = (GRID['ringOuterRadius'] - GRID['ringSide']) * k
    ry_i = (GRID['ringOuterRadius'] - GRID['ringTopBottom']) * k
    om = G['o']['display']
    u = size / om['size']
    out.append(f"<g transform='translate({cx - R},{cy - R}) scale({u})'><path fill='{CREAM}' d='{om['mark']}'/></g>")
    seed_r, seam = om['seed']['r'] * u, om['seam'] * u
    out += [
        circle(cx, cy, R), circle(cx, cy, rx_i, ry_i),
        line(cx - R - 40, cy, cx + R + 40, cy, dash='4 4'), line(cx, cy - R - 40, cx, cy + R + 40, dash='4 4'),
        circle(cx, cy - R + seed_r, seed_r, dash='3 3'),
        circle(cx, cy - R + seed_r, seed_r + seam, dash='3 3'),
    ]
    # dimension callouts
    tx = cx + R + 70
    rows = [
        ('Outer', f"circle, R {GRID['ringOuterRadius']:g} u (x-height 520 + 2 × 12 overshoot)"),
        ('Counter', f"{GRID['counterRatio']} of the outer width, kept from the original mark"),
        ('Ring side', f"{GRID['ringSide']} u at 3 and 9 o'clock"),
        ('Ring top', f"{GRID['ringTopBottom']} u at 12 and 6 o'clock, contrast {GRID['contrast']}"),
        ('', 'horizontals read heavier, so they are drawn 3% thinner'),
        ('Seed', 'a ball of ⌀ = ring thickness on the ring midline at 12'),
        ('Seam', f"hairline {GRID['seamDisplay']} u, concentric with the seed"),
        ('', f"opens to {GRID['seamText']} u in the text master (1 px at 16 px)"),
        ('Overshoot', f"{GRID['overshoot']} u past baseline and x-height (2.3%)"),
    ]
    yy = cy - 150
    for a, b in rows:
        out.append(text(tx, yy, a, 15, CREAM, weight=700) + text(tx + 110, yy, b, 15))
        yy += 34
    return ''.join(out), y0 + 90 + size + 60


def word_panel(y0):
    out = [section(y0, 2, 'The word', 'Drawn as font outlines, spaced by area, kerned by eye.')]
    w = G['wordmark']['display']
    height = 300
    x0 = 220
    g, width, s = wordmark('display', x0, y0 + 110, height, CREAM)
    base = y0 + 110 + w['baseline'] * s
    lines = [
        (base, 'baseline 0'), (base - GRID['xHeight'] * s, 'x-height 520'),
        (base - GRID['capHeight'] * s, 'cap 700'),
        (base + GRID['overshoot'] * s, 'overshoot −12'),
        (base - (GRID['xHeight'] + GRID['overshoot']) * s, 'overshoot 532'),
    ]
    for yy, label in lines:
        dash = '3 4' if 'overshoot' in label else None
        out.append(line(x0 - 40, yy, x0 + width + 40, yy, w=1, dash=dash))
        if 'overshoot' in label:
            out.append(text(x0 - 50, yy + 5, label, 13, GUIDE, 'end'))
        else:
            out.append(text(x0 + width + 50, yy + 5, label, 13, GUIDE))
    # advance boundaries
    for gl in w['glyphs']:
        gx = x0 + gl['x'] * s
        out.append(line(gx, base + 30, gx, base + 44, MUTED))
        out.append(text(gx + gl['advance'] * s / 2, base + 44, gl['char'], 12, MUTED, 'middle'))
    out.append(g)
    yy = base + 90
    notes = [
        ('Stem', f"{GRID['stem']} u = ring side ÷ 1.04. Rounds are drawn heavier to look equal."),
        ('J', f"hook is the O's bowl at {GRID['jHookRadius']} u radius, flush with the stem, cut flat at 9."),
        ('v', f"diagonals {GRID['vStroke']} u (0.93 of stem), flat foot {GRID['vFoot']} u so the join never clogs."),
        ('i', f"round dot ⌀ {GRID['dot']} u, top on the cap line plus overshoot."),
        ('e', f"top/bottom 0.83, bar {GRID['eBar']} u (0.61): the strongest contrast, so the eye stays open."),
        ('Space', f"each side = {GRID['straightSidebearing']} u minus the white its own shape encloses (to 0.22 x-height deep)."),
    ]
    for a, b in notes:
        out.append(text(120, yy, a, 15, CREAM, weight=700) + text(200, yy, b, 15))
        yy += 32
    return ''.join(out), yy + 50


def clear_panel(y0):
    out = [section(y0, 3, 'Clear space and minimum size', 'Clear space is half the O on every side.')]
    w = G['wordmark']['display']
    height = 120
    g, width, s = wordmark('display', 200, y0 + 140, height, CREAM)
    o_d = 2 * GRID['ringOuterRadius'] * s
    pad = o_d / 2
    out.append(f"<rect x='{200 - pad}' y='{y0 + 140 - pad}' width='{width + 2 * pad}' height='{height + 2 * pad}' fill='none' stroke='{GUIDE}' stroke-dasharray='4 4'/>")
    out.append(g)
    mx = 200 + width + 2 * pad + 120
    md = 120
    out.append(f"<rect x='{mx - md / 2}' y='{y0 + 140 - md / 2}' width='{md * 2}' height='{md * 2}' fill='none' stroke='{GUIDE}' stroke-dasharray='4 4'/>")
    out.append(f"<g transform='translate({mx},{y0 + 140}) scale({md / 100})'><path fill='{CREAM}' d='{G['o']['display']['mark']}'/></g>")
    # minimum sizes
    yy = y0 + 140 + height + pad + 80
    out.append(text(120, yy, 'Minimum', 15, CREAM, weight=700))
    gx = 230
    for h in (24, 16, 12):
        master = 'display' if h >= 24 else 'text'
        gg, ww, _ = wordmark(master, gx, yy - h + 4, h, CREAM)
        out.append(gg + text(gx, yy + 28, f'{h} px · {master}', 13))
        gx += ww + 70
    for px in (32, 24, 16):
        out.append(f"<g transform='translate({gx},{yy - px + 4})'><path fill='{CREAM}' d='{G['o'][str(px)]['mark']}'/></g>")
        out.append(text(gx, yy + 28, f'{px} px', 13))
        gx += px + 60
    out.append(text(120, yy + 64, 'Below 24 px the text master opens the seam and loosens spacing. The 16, 24 and 32 px marks are pixel masters: every tangent edge sits on a whole pixel.', 14))
    return ''.join(out), yy + 110


def variant_panel(y0):
    out = [section(y0, 4, 'Light, dark, mono', 'One ink per surface. The mark never takes an accent fill.')]
    tiles = [(CREAM, INK, 'Light · ink on cream'), (INK, CREAM, 'Dark · cream on ink'),
             ('#FFFFFF', '#000000', 'Mono · black'), ('#000000', '#FFFFFF', 'Mono · white')]
    tw, th = 330, 200
    for i, (bg, fg, label) in enumerate(tiles):
        x = 120 + i * (tw + 20)
        y = y0 + 70
        stroke = f" stroke='{DIM}'" if bg in (INK, '#000000') else ''
        out.append(f"<rect x='{x}' y='{y}' width='{tw}' height='{th}' rx='12' fill='{bg}'{stroke}/>")
        g, ww, _ = wordmark('display', x + (tw - 180) / 2, y + 60, 180 * G['wordmark']['display']['viewBox'][3] / G['wordmark']['display']['viewBox'][2], fg)
        out.append(g)
        out.append(text(x, y + th + 26, label, 13))
    return ''.join(out), y0 + 70 + th + 70


def main():
    body, y = '', 120
    body += text(80, 70, 'Jovie mark · construction', 30, CREAM, weight=800)
    body += text(W - 80, 70, 'JOV-7760 · generated from packages/brand/font/construction.py', 13, MUTED, 'end')
    for panel in (mark_panel, word_panel, clear_panel, variant_panel):
        part, y = panel(y + 40)
        body += part
    svg = (f"<svg xmlns='http://www.w3.org/2000/svg' width='{W}' height='{y}' viewBox='0 0 {W} {y}' role='img' aria-label='Jovie mark construction'><title>Jovie mark construction</title>"
           f"<rect width='{W}' height='{y}' fill='{INK}'/>{body}</svg>")
    out = PKG / 'svg' / 'construction-sheet.svg'
    out.parent.mkdir(exist_ok=True)
    out.write_text(svg)
    print(out, y)


if __name__ == '__main__':
    main()
