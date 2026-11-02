/**
 * Render guard for the Pen review loop: a render a judge must never see
 * (renderer noise, blank output, missing icon glyphs, unloaded fonts or image
 * fills) fails here. Cold Pen exports race web-font and image loading
 * (2026-11-01: Material Symbols drew as "?", text drew without ink); the
 * bridge re-exports after a wait, and this guard fails what still looks wrong.
 */

import { hasImageFill } from './lib.mjs';

// ── Render guard ─────────────────────────────────────────────────────────

/**
 * img = {width,height,data:RGBA}. Renderer noise on a dark frame shows as a
 * mostly-white field of speckles; a blank render is one colour.
 */
export function imageStats(img) {
  let sum = 0;
  let sumSq = 0;
  let white = 0;
  const n = img.width * img.height;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const l =
      (0.2126 * img.data[i] +
        0.7152 * img.data[i + 1] +
        0.0722 * img.data[i + 2]) /
      255;
    sum += l;
    sumSq += l * l;
    if (l > 0.92) white++;
  }
  const mean = sum / n;
  return {
    mean,
    std: Math.sqrt(Math.max(0, sumSq / n - mean * mean)),
    whiteShare: white / n,
  };
}

/**
 * Speckle per mille per horizontal band: share of pixels that spike against
 * both neighbours (horizontally or vertically) by more than 48/255 luma.
 * A mis-strided raster readback (2026-11-01 G9KFB) is a field of such spikes:
 * 49‰ horizontal and 72‰ vertical, while clean UI renders stay under 14‰ and
 * 9‰ (measured on CRM, pricing, profile and app-chat renders). Banding catches
 * a render that is garbled only below some row.
 */
export const GARBLE_BAND_PERMILLE = 30;
export function speckleBands(img, bands = 8) {
  const W = img.width;
  const H = img.height;
  const L = (x, y) => {
    const i = (y * W + x) * 4;
    return (
      0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2]
    );
  };
  const spike = (c, a, b) =>
    (c - a > 48 && c - b > 48) || (a - c > 48 && b - c > 48);
  const out = [];
  const step = Math.max(1, Math.floor(H / bands));
  for (let b = 0; b < bands; b++) {
    let h = 0;
    let v = 0;
    let n = 0;
    const y0 = Math.max(1, b * step);
    const y1 = Math.min(H - 1, (b + 1) * step);
    for (let y = y0; y < y1; y += 2)
      for (let x = 1; x < W - 1; x++) {
        const c = L(x, y);
        n++;
        if (spike(c, L(x - 1, y), L(x + 1, y))) h++;
        if (spike(c, L(x, y - 1), L(x, y + 1))) v++;
      }
    out.push({ band: b, h: n ? (h / n) * 1000 : 0, v: n ? (v / n) * 1000 : 0 });
  }
  return out;
}

/** Garbled raster: any band whose vertical speckle exceeds the threshold. */
export function garbleFinding(img) {
  const bad = speckleBands(img).filter(
    b => b.v > GARBLE_BAND_PERMILLE || b.h + b.v > 2 * GARBLE_BAND_PERMILLE
  );
  return bad.length
    ? `garbled raster: ${bad.length}/8 bands of speckle (worst ${Math.round(Math.max(...bad.map(b => b.v)))}‰ vertical)`
    : null;
}

export function cropStats(img, box) {
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(img.width, Math.ceil(box.x + box.w));
  const y1 = Math.min(img.height, Math.ceil(box.y + box.h));
  const lum = [];
  const colors = new Map();
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      const r = img.data[i];
      const g = img.data[i + 1];
      const b = img.data[i + 2];
      lum.push((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255);
      const q = `${r >> 4},${g >> 4},${b >> 4}`;
      colors.set(q, (colors.get(q) ?? 0) + 1);
    }
  if (lum.length === 0) return { n: 0, std: 0, top2Share: 1, sig: '' };
  const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
  const std = Math.sqrt(
    lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length
  );
  const top = [...colors.values()].sort((a, b) => b - a);
  // Downsampled 8x8 binary signature for glyph-equality tests.
  const sig = [];
  for (let gy = 0; gy < 8; gy++)
    for (let gx = 0; gx < 8; gx++) {
      const sx = x0 + Math.floor(((gx + 0.5) * (x1 - x0)) / 8);
      const sy = y0 + Math.floor(((gy + 0.5) * (y1 - y0)) / 8);
      const i = (sy * img.width + sx) * 4;
      sig.push(
        (0.2126 * img.data[i] +
          0.7152 * img.data[i + 1] +
          0.0722 * img.data[i + 2]) /
          255 >
          mean
          ? 1
          : 0
      );
    }
  return {
    n: lum.length,
    mean,
    std,
    top2Share: ((top[0] ?? 0) + (top[1] ?? 0)) / lum.length,
    colors: colors.size,
    sig: sig.join(''),
  };
}

/**
 * Fails a render that a judge must never see. `renders` = [{id, md5, img}] of
 * one batch; `facts` (optional) gives node bounds for glyph checks.
 * Returns [{id, reason}] — empty means every render is trustworthy.
 */
export function renderGuard(renders, factsById = {}, { dark = true } = {}) {
  const bad = [];
  const hashes = new Map();
  for (const r of renders)
    hashes.set(r.md5, [...(hashes.get(r.md5) ?? []), r.id]);
  for (const r of renders) {
    if (renders.length > 1 && hashes.get(r.md5).length > 1) {
      bad.push({
        id: r.id,
        reason: `identical render to ${hashes
          .get(r.md5)
          .filter(x => x !== r.id)
          .join(',')} (renderer noise)`,
      });
      continue;
    }
    const s = imageStats(r.img);
    if (s.std < 0.01) {
      bad.push({ id: r.id, reason: 'blank render' });
      continue;
    }
    if (dark && (s.whiteShare > 0.5 || s.mean > 0.6)) {
      bad.push({
        id: r.id,
        reason: `renderer noise: ${Math.round(s.whiteShare * 100)}% white on a dark frame`,
      });
      continue;
    }
    const garble = garbleFinding(r.img);
    if (garble) {
      bad.push({ id: r.id, reason: garble });
      continue;
    }
    const facts = factsById[r.id];
    if (facts)
      bad.push(
        ...glyphFindings(r, facts).map(reason => ({ id: r.id, reason }))
      );
  }
  return bad;
}

/** Missing icon glyphs, blank text and unloaded image fills inside one render. */
export function glyphFindings(render, facts) {
  const reasons = [];
  const nodes = facts.nodes.filter(n => n.d > 0);
  const icons = nodes.filter(n => n.t === 'icon_font' && n.w >= 8 && n.h >= 8);
  if (icons.length >= 3) {
    const names = new Set(icons.map(n => n.ic));
    const sigs = new Map();
    for (const n of icons) {
      const s = cropStats(render.img, n).sig;
      sigs.set(s, (sigs.get(s) ?? 0) + 1);
    }
    const [topSig, topCount] = [...sigs.entries()].sort(
      (a, b) => b[1] - a[1]
    )[0];
    if (names.size >= 3 && topSig && topCount / icons.length > 0.8)
      reasons.push(
        `missing icon glyphs: ${topCount}/${icons.length} icons of ${names.size} kinds render the same fallback glyph`
      );
  }
  const texts = nodes.filter(
    n =>
      n.t === 'text' &&
      String(n.tx ?? '').trim().length >= 3 &&
      n.w >= 12 &&
      n.h >= 6
  );
  if (texts.length) {
    const blank = texts.filter(n => cropStats(render.img, n).std < 0.02);
    if (blank.length / texts.length > 0.3)
      reasons.push(
        `missing text: ${blank.length}/${texts.length} text nodes rendered without ink (fonts not loaded)`
      );
  }
  for (const n of nodes.filter(
    x => hasImageFill(x.fill) && x.w >= 32 && x.h >= 32
  )) {
    const s = cropStats(render.img, n);
    if (s.colors <= 4 && s.top2Share > 0.9 && s.std > 0.02)
      reasons.push(`image fill not loaded (checkerboard) on ${n.id}`);
  }
  return reasons;
}
