/**
 * Accent pack detectors. Pure: source text in, violation ids out.
 *
 * Rules (contract: .claude/rules/ui.md "Accent pack"):
 *  a  off-pack color        off-pack-tailwind / off-pack-literal / off-pack-var
 *  b  two-tone gradient     two-tone-gradient
 *  c  rotation order        rotation-order, adjacent-accent
 *  d  one accent per item   multi-accent-item, multi-accent-file (heuristic)
 *  e  green/red min set     mint-red-min-set, mint-red-unguarded, rotation-helper-no-threshold
 *  f  equal weight          unequal-weight (heuristic)
 *  g  solid container fill  solid-accent-fill
 *
 * (d), (e), (f) and (g) are heuristics over a token stream. They aim to be
 * reviewable, not exact: every id names the file and the evidence.
 */
import {
  DATA_VIZ_PATH,
  EXTRA_PACK_HEX,
  expectedAccent,
  GRADIENT_HUE_TOLERANCE,
  GRADIENT_NEUTRAL_CHROMA,
  GRADIENT_TWO_ACCENT_ALLOW,
  GREEN_RED_MIN_SET,
  PACK_HEX,
  ROTATION_HELPER_NAME,
  STATUS_IDENT,
  STATUS_NAME,
  STATUS_TAG,
  STATUS_VALUE,
} from './accent-pack-config.mjs';

/* ------------------------------------------------------------------ color */

const PALETTE_WORDS =
  'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const UTILITY =
  'text|bg|border|from|via|to|ring|fill|stroke|outline|decoration|shadow|accent|divide|caret';
export const TAILWIND_PALETTE = new RegExp(
  `(?<![\\w-])(?:[\\w[\\]-]+:)*(${UTILITY})-(${PALETTE_WORDS})-(\\d{2,3})(?![\\w])`,
  'g'
);

/** word -> hue family */
const WORD_FAMILY = {
  red: 'red',
  rose: 'red',
  flare: 'red',
  orange: 'orange',
  amber: 'orange',
  gold: 'orange',
  yellow: 'yellow',
  lime: 'yellow',
  green: 'green',
  emerald: 'green',
  mint: 'green',
  aqua: 'green',
  teal: 'green',
  cyan: 'cyan',
  sky: 'cyan',
  blue: 'blue',
  ion: 'blue',
  indigo: 'blue',
  purple: 'purple',
  violet: 'purple',
  ultra: 'purple',
  pink: 'pink',
  fuchsia: 'pink',
  pulse: 'pink',
};
const FAMILY_ACCENT = {
  blue: 'ion',
  purple: 'ultra',
  pink: 'pulse',
  orange: 'orange',
  green: 'mint',
  red: 'red',
};
export const accentOf = family => FAMILY_ACCENT[family] ?? family;

export function familyOfWords(text) {
  const words = String(text)
    .toLowerCase()
    .replace(/^noir-ion-/, '')
    .split(/[^a-z]+/);
  for (const word of words) if (WORD_FAMILY[word]) return WORD_FAMILY[word];
  return null;
}

function hueFamily(h) {
  if (h >= 345 || h < 15) return 'red';
  if (h < 45) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 165) return 'green';
  if (h < 200) return 'cyan';
  if (h < 255) return 'blue';
  if (h < 300) return 'purple';
  return 'pink';
}

function rgbFamily(r, g, b) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return null;
  const s = d / (1 - Math.abs(2 * l - 1));
  if (s < 0.35 || l < 0.15 || l > 0.92) return null;
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  let h;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return hueFamily((h * 60 + 360) % 360);
}

export function hexFamily(hex) {
  let body = hex.replace('#', '');
  if (body.length === 3 || body.length === 4)
    body = body
      .slice(0, 3)
      .split('')
      .map(c => c + c)
      .join('');
  if (body.length === 8) body = body.slice(0, 6);
  if (body.length !== 6 || /[^0-9a-f]/i.test(body)) return null;
  const n = Number.parseInt(body, 16);
  return rgbFamily((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

const COLOR_TOKEN =
  /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)|var\(--[a-z0-9-]+/gi;

function oneColorFamily(token) {
  const t = token.toLowerCase();
  if (t.startsWith('#')) return hexFamily(t);
  if (t.startsWith('var(')) return familyOfWords(t.slice(6));
  const nums = (t.match(/-?\d*\.?\d+%?/g) ?? []).map(Number.parseFloat);
  if (t.startsWith('rgb'))
    return nums.length >= 3 ? rgbFamily(nums[0], nums[1], nums[2]) : null;
  if (t.startsWith('hsl')) {
    const [h, s, l] = nums;
    if (s === undefined || s < 35 || l < 15 || l > 92) return null;
    return hueFamily(((h % 360) + 360) % 360);
  }
  if (t.startsWith('oklch')) {
    const [, c, h] = nums;
    if (c === undefined || c < 0.07 || h === undefined) return null;
    const hh = ((h % 360) + 360) % 360;
    if (hh < 20 || hh >= 345) return 'red';
    if (hh < 70) return 'orange';
    if (hh < 110) return 'yellow';
    if (hh < 175) return 'green';
    if (hh < 225) return 'cyan';
    if (hh < 265) return 'blue';
    if (hh < 320) return 'purple';
    return 'pink';
  }
  return null;
}

/** Hue families named in one CSS or Tailwind value, in order, deduplicated. */
export function colorFamilies(value) {
  const out = [];
  const text = String(value);
  for (const match of text.matchAll(COLOR_TOKEN)) {
    const family = oneColorFamily(match[0]);
    if (family && !out.includes(family)) out.push(family);
  }
  // Tailwind names inside the value: from-blue-500, bg-accent-purple, ion.
  if (!out.length) {
    const family = familyOfWords(text.replace(/\d+/g, ' '));
    if (family) out.push(family);
  }
  return out;
}

/* ------------------------------------------------------------- tokenizer */

const KEYWORD_BEFORE_JSX = new Set([
  'return',
  'case',
  'default',
  'else',
  'yield',
  'await',
  'in',
  'of',
]);

export function tokenize(source) {
  const toks = [];
  const n = source.length;
  let i = 0;
  while (i < n) {
    const c = source[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && source[j] !== c && source[j] !== '\n')
        j += source[j] === '\\' ? 2 : 1;
      if (source[j] === c) {
        toks.push({ t: 'str', v: source.slice(i + 1, j), i });
        i = j + 1;
      } else {
        toks.push({ t: 'p', v: c, i });
        i++;
      }
      continue;
    }
    if (c === '`') {
      let j = i + 1;
      let depth = 0;
      while (j < n) {
        const d = source[j];
        if (d === '\\') {
          j += 2;
          continue;
        }
        if (depth === 0 && d === '`') break;
        if (d === '$' && source[j + 1] === '{') {
          depth++;
          j += 2;
          continue;
        }
        if (depth > 0 && d === '{') depth++;
        if (depth > 0 && d === '}') depth--;
        j++;
      }
      toks.push({ t: 'str', v: source.slice(i + 1, j), i, tpl: true });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = /^[A-Za-z_$][\w$]*(?:-[A-Za-z][\w$]*)*/.exec(
        source.slice(i, i + 80)
      );
      toks.push({ t: 'id', v: m[0], i });
      i += m[0].length;
      continue;
    }
    if (/\d/.test(c)) {
      const m = /^[\d.]+/.exec(source.slice(i, i + 30));
      toks.push({ t: 'num', v: m[0], i });
      i += m[0].length;
      continue;
    }
    if (c === '=' && source[i + 1] === '>') {
      toks.push({ t: 'p', v: '=>', i });
      i += 2;
      continue;
    }
    toks.push({ t: 'p', v: c, i });
    i++;
  }
  return toks;
}

const OPEN = { '(': ')', '[': ']', '{': '}' };

function matchClose(toks, start) {
  const open = toks[start].v;
  const close = OPEN[open];
  let depth = 0;
  for (let k = start; k < toks.length; k++) {
    const tk = toks[k];
    if (tk.t !== 'p') continue;
    if (tk.v === open) depth++;
    else if (tk.v === close && --depth === 0) return k;
  }
  return -1;
}

/** JSX opening tags: { tag, toks } with all tokens up to the closing `>`. */
export function jsxElements(toks) {
  const out = [];
  for (let k = 0; k < toks.length - 1; k++) {
    if (toks[k].t !== 'p' || toks[k].v !== '<' || toks[k + 1].t !== 'id')
      continue;
    const prev = toks[k - 1];
    if (
      prev &&
      ((prev.t === 'id' && !KEYWORD_BEFORE_JSX.has(prev.v)) ||
        prev.t === 'num' ||
        prev.t === 'str' ||
        (prev.t === 'p' && (prev.v === ')' || prev.v === ']')))
    )
      continue;
    let depth = 0;
    let end = -1;
    for (let m = k + 2; m < toks.length && m < k + 600; m++) {
      const tk = toks[m];
      if (tk.t !== 'p') continue;
      if (tk.v === '{' || tk.v === '(' || tk.v === '[') depth++;
      else if (tk.v === '}' || tk.v === ')' || tk.v === ']') depth--;
      else if (tk.v === '>' && depth === 0) {
        end = m;
        break;
      } else if (tk.v === '<' && depth === 0) break;
    }
    if (end === -1) continue;
    out.push({ tag: toks[k + 1].v, toks: toks.slice(k + 2, end) });
  }
  return out;
}

/** Array literals: { name, toks (inside), elements: token[][] }. */
export function arrayLiterals(toks) {
  const out = [];
  for (let k = 0; k < toks.length; k++) {
    const tk = toks[k];
    if (tk.t !== 'p' || tk.v !== '[') continue;
    const prev = toks[k - 1];
    if (
      prev &&
      ((prev.t === 'id' && !KEYWORD_BEFORE_JSX.has(prev.v)) ||
        prev.t === 'num' ||
        prev.t === 'str' ||
        (prev.t === 'p' && (prev.v === ')' || prev.v === ']')))
    )
      continue;
    const end = matchClose(toks, k);
    if (end === -1) continue;
    const inner = toks.slice(k + 1, end);
    const elements = [];
    let cur = [];
    let depth = 0;
    for (const it of inner) {
      if (it.t === 'p' && '([{'.includes(it.v)) depth++;
      if (it.t === 'p' && ')]}'.includes(it.v)) depth--;
      if (it.t === 'p' && it.v === ',' && depth === 0) {
        elements.push(cur);
        cur = [];
        continue;
      }
      cur.push(it);
    }
    if (cur.length) elements.push(cur);
    // Declared name: walk back to `=` then collect identifiers to the keyword.
    let name = '';
    let b = k - 1;
    if (toks[b] && toks[b].v === '(') b--; // `= Object.freeze([`
    while (
      b >= 0 &&
      toks[b].t === 'p' &&
      (toks[b].v === '.' || toks[b].v === '(')
    )
      b -= 2;
    if (toks[b] && toks[b].v === '=') {
      const names = [];
      for (let c = b - 1; c >= 0 && c > b - 12; c--) {
        if (
          toks[c].t === 'id' &&
          /^(const|let|var|export|type|function)$/.test(toks[c].v)
        )
          break;
        if (toks[c].t === 'id') names.unshift(toks[c].v);
        if (toks[c].t === 'p' && (toks[c].v === ';' || toks[c].v === '}'))
          break;
      }
      name = names.join(' ');
    } else if (
      toks[b] &&
      toks[b].t === 'p' &&
      toks[b].v === ':' &&
      toks[b - 1]?.t === 'id'
    ) {
      name = toks[b - 1].v;
    }
    out.push({ name, elements, start: k, end });
  }
  return out;
}

/* --------------------------------------------------------- name -> accent */

const ACCENT_NAME = {
  ion: 'ion',
  blue: 'ion',
  ultra: 'ultra',
  purple: 'ultra',
  pulse: 'pulse',
  pink: 'pulse',
  orange: 'orange',
  gold: 'orange',
  mint: 'mint',
  green: 'mint',
  aqua: 'mint',
  teal: 'mint',
  red: 'red',
  flare: 'red',
};
const NEUTRAL_NAME = new Set([
  'gray',
  'grey',
  'neutral',
  'slate',
  'zinc',
  'none',
]);

const PACK_HEX_FAMILY = Object.fromEntries(
  [
    ...EXTRA_PACK_HEX,
    '#11afff',
    '#8e56f5',
    '#f52bb5',
    '#3ffa8b',
    '#ff7800',
    '#f72a36',
  ]
    .map(h => [h, FAMILY_ACCENT[hexFamily(h)]])
    .filter(([, a]) => a)
);

/** Exact accent token: 'ion', 'var(--color-accent-blue)', '#8e56f5', 'bg-ion'. */
export function elementAccent(el) {
  for (const tk of el) {
    if (tk.t !== 'str') continue;
    const v = tk.v.trim().toLowerCase();
    if (ACCENT_NAME[v]) return ACCENT_NAME[v];
    if (NEUTRAL_NAME.has(v)) return 'neutral';
    const m = /^var\(--(?:color-accent|noir-ion)-([a-z]+)\)$/.exec(v);
    if (m && ACCENT_NAME[m[1]]) return ACCENT_NAME[m[1]];
    if (PACK_HEX_FAMILY[v]) return PACK_HEX_FAMILY[v];
  }
  // object element: `accent: 'ion'` style property
  for (let k = 0; k < el.length - 2; k++) {
    if (
      el[k].t === 'id' &&
      /^(accent|accentColor|accentName)$/i.test(el[k].v) &&
      el[k + 1].v === ':' &&
      el[k + 2].t === 'str'
    ) {
      const v = el[k + 2].v.trim().toLowerCase();
      if (ACCENT_NAME[v]) return ACCENT_NAME[v];
      if (NEUTRAL_NAME.has(v)) return 'neutral';
    }
  }
  return null;
}

const isStatusRole = toks =>
  toks.some(
    tk =>
      (tk.t === 'id' && STATUS_IDENT.test(tk.v)) ||
      (tk.t === 'str' && STATUS_VALUE.test(tk.v.trim()))
  );

/* -------------------------------------------------------------- utilities */

const STOP = /(?<![\w-])((?:[\w[\]-]+:)*)(from|via|to)-(\[[^\]]+\]|[\w./%-]+)/g;
const BG = /(?<![\w-])((?:[\w[\]-]+:)*)bg-(\[[^\]]+\]|[\w./%-]+)/g;

/* ------------------------------------------------- gradient hue analysis */

function srgbToOklch(r, g, b) {
  const lin = c => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [lr, lg, lb] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(
    0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb
  );
  const m = Math.cbrt(
    0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb
  );
  const sx = Math.cbrt(
    0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb
  );
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * sx;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * sx;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * sx;
  return {
    L,
    C: Math.hypot(a, bb),
    h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360,
  };
}

/** OKLCH of one color token, or null when it is not a color literal. */
export function toOklch(token) {
  const t = token.toLowerCase();
  if (t.startsWith('#')) {
    let body = t.slice(1);
    if (body.length === 3 || body.length === 4)
      body = body
        .slice(0, 3)
        .split('')
        .map(c => c + c)
        .join('');
    if (body.length === 8) body = body.slice(0, 6);
    if (!/^[0-9a-f]{6}$/.test(body)) return null;
    const n = Number.parseInt(body, 16);
    return srgbToOklch((n >> 16) & 255, (n >> 8) & 255, n & 255);
  }
  const nums = (t.match(/-?\d*\.?\d+%?/g) ?? []).map(Number.parseFloat);
  if (t.startsWith('rgb') && nums.length >= 3)
    return srgbToOklch(nums[0], nums[1], nums[2]);
  if (t.startsWith('hsl') && nums.length >= 3) {
    const h = ((nums[0] % 360) + 360) % 360;
    const s2 = nums[1] / 100;
    const l2 = nums[2] / 100;
    const k = n => (n + h / 30) % 12;
    const a2 = s2 * Math.min(l2, 1 - l2);
    const f = n =>
      l2 - a2 * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return srgbToOklch(f(0) * 255, f(8) * 255, f(4) * 255);
  }
  if (t.startsWith('oklch') && nums.length >= 3) {
    const L =
      /%/.test(t.split(/[\s,]+/)[0]) || nums[0] > 1 ? nums[0] / 100 : nums[0];
    return { L, C: nums[1], h: ((nums[2] % 360) + 360) % 360 };
  }
  return null;
}

const hueDistance = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
const PACK_HUES = Object.fromEntries(
  Object.entries(PACK_HEX).map(([name, hex]) => [name, toOklch(hex).h])
);
const ACCENT_BY_WORD = {
  blue: 'ion',
  ion: 'ion',
  purple: 'ultra',
  ultra: 'ultra',
  pink: 'pulse',
  pulse: 'pulse',
  orange: 'orange',
  gold: 'orange',
  green: 'mint',
  mint: 'mint',
  aqua: 'mint',
  teal: 'mint',
  red: 'red',
  flare: 'red',
};

/** A gradient stop: neutral, an accent, or an off-accent hue. */
function stopOf(token) {
  const t = token.toLowerCase();
  const v = /^var\(--([a-z0-9-]+)/.exec(t);
  if (v) {
    if (/geist/.test(v[1])) {
      const fam = familyOfWords(v[1]);
      return fam
        ? { kind: 'off', family: fam, hue: null }
        : { kind: 'neutral' };
    }
    const word = v[1]
      .replace(/^noir-ion-/, '')
      .split(/[^a-z]+/)
      .find(w => ACCENT_BY_WORD[w] || WORD_FAMILY[w]);
    if (!word) return { kind: 'neutral' };
    if (ACCENT_BY_WORD[word])
      return { kind: 'accent', accent: ACCENT_BY_WORD[word] };
    return { kind: 'off', family: WORD_FAMILY[word], hue: null };
  }
  const ok = toOklch(t);
  if (!ok) return null;
  if (ok.C < GRADIENT_NEUTRAL_CHROMA || ok.L < 0.1 || ok.L > 0.985)
    return { kind: 'neutral' };
  let best = null;
  for (const [name, hue] of Object.entries(PACK_HUES)) {
    const d = hueDistance(ok.h, hue);
    if (!best || d < best.d) best = { name, d };
  }
  if (best && best.d <= GRADIENT_HUE_TOLERANCE)
    return { kind: 'accent', accent: best.name };
  return { kind: 'off', family: oklchFamily(ok.h), hue: Math.round(ok.h) };
}

function oklchFamily(hh) {
  if (hh < 20 || hh >= 345) return 'red';
  if (hh < 70) return 'orange';
  if (hh < 110) return 'yellow';
  if (hh < 175) return 'green';
  if (hh < 225) return 'cyan';
  if (hh < 265) return 'blue';
  if (hh < 320) return 'purple';
  return 'pink';
}

const TW_ACCENT =
  /^(?:accent-|noir-ion-)?(ion|ultra|pulse|mint|aqua|blue|purple|pink|orange|gold|green|teal|red|flare)(?:-(?:subtle|soft))?(?:\/\d+)?$/;

function tailwindStop(value) {
  const v = value.replace(/_/g, ' ').replace(/^\[|\]$/g, '');
  const colors = [...v.matchAll(COLOR_TOKEN)]
    .map(m => stopOf(m[0]))
    .filter(Boolean);
  if (colors.length) return colors;
  const word = v.replace(/\/\d+$/, '');
  const m = TW_ACCENT.exec(word);
  if (
    m &&
    (/^(accent-|noir-ion-)/.test(word) || /^(ion|ultra|pulse|mint)/.test(word))
  )
    return [{ kind: 'accent', accent: ACCENT_BY_WORD[m[1]] }];
  const pal = new RegExp(`^(?:${PALETTE_WORDS})-\\d{2,3}`).exec(word);
  if (pal) return [{ kind: 'off', family: familyOfWords(word), hue: null }];
  return [];
}

/** Every gradient in a string: { stops: stop[] } from CSS, Tailwind and SVG. */
export function analyzeGradients(str) {
  const out = [];
  const groups = new Map();
  for (const m of str.matchAll(STOP)) {
    const stops = tailwindStop(m[3]);
    if (!stops.length) continue;
    groups.set(m[1], [...(groups.get(m[1]) ?? []), ...stops]);
  }
  for (const stops of groups.values()) out.push({ stops });
  for (const m of str.matchAll(
    /(?:repeating-)?(?:linear|radial|conic)-gradient\(/g
  )) {
    let depth = 1;
    let j = m.index + m[0].length;
    const start = j;
    while (j < str.length && depth > 0) {
      if (str[j] === '(') depth++;
      else if (str[j] === ')') depth--;
      j++;
    }
    const body = str.slice(start, j);
    out.push({
      stops: [...body.matchAll(COLOR_TOKEN)]
        .map(c => stopOf(c[0]))
        .filter(Boolean),
    });
  }
  return out;
}

/** SVG linearGradient and radialGradient stops, in markup or JSX. */
export function analyzeSvgGradients(str) {
  const out = [];
  for (const g of str.matchAll(
    /<(linear|radial)Gradient\b[\s\S]*?<\/\1Gradient>/gi
  )) {
    const stops = [
      ...g[0].matchAll(/stop-?color\s*[=:]\s*\{?\s*["'`]?([^"'`};>]+)/gi),
    ]
      .flatMap(c => [...c[1].matchAll(COLOR_TOKEN)].map(x => stopOf(x[0])))
      .filter(Boolean);
    out.push({ stops });
  }
  return out;
}

const FAMILY_OF_ACCENT = {
  ion: 'blue',
  ultra: 'purple',
  pulse: 'pink',
  orange: 'orange',
  mint: 'green',
  red: 'red',
};

function violationsOf(gradients, file, allow) {
  const out = [];
  for (const g of gradients) {
    const accents = [
      ...new Set(g.stops.filter(x => x.kind === 'accent').map(x => x.accent)),
    ].sort();
    const off = g.stops.filter(x => x.kind === 'off');
    const families = new Set([
      ...accents.map(a => FAMILY_OF_ACCENT[a]),
      ...off.map(x => x.family).filter(Boolean),
    ]);
    if (families.size >= 2) {
      if (off.length === 0 && gradientAllowed(allow, file, accents)) continue;
      out.push({
        rule: 'two-tone-gradient',
        label: [...families].map(accentOf).sort().join('+'),
      });
    } else if (off.length) {
      out.push({
        rule: 'gradient-off-hue',
        label: off.map(x => `${x.family}${x.hue ? `@${x.hue}` : ''}`).sort()[0],
      });
    }
  }
  return out;
}

/** Violations of the gradient rule: [{ rule, label }]. */
export function gradientViolations(
  str,
  file,
  allow = GRADIENT_TWO_ACCENT_ALLOW
) {
  return violationsOf(
    [...analyzeGradients(str), ...analyzeSvgGradients(str)],
    file,
    allow
  );
}

export function svgGradientViolations(
  str,
  file,
  allow = GRADIENT_TWO_ACCENT_ALLOW
) {
  return violationsOf(analyzeSvgGradients(str), file, allow);
}

export function gradientAllowed(allow, file, accents) {
  return allow.some(
    e =>
      e.file === file &&
      e.reason &&
      Array.isArray(e.stops) &&
      e.stops.slice().sort().join('+') === accents.join('+')
  );
}

function gradientFamilies(str) {
  return gradientViolations(str, '').map(v => v.label.split('+'));
}

const bgParts = value => {
  // Tailwind bg- value: returns { family, opacity, soft, step }
  const v = value.replace(/_/g, ' ');
  if (
    /^(linear|radial|conic|gradient|none|transparent|inherit|current|auto|cover|contain|fixed|local|scroll|clip|origin|repeat|no-repeat|center|top|bottom|left|right|size|position|blend|opacity|\(|\[(linear|radial|conic|url))/.test(
      v
    )
  )
    return null;
  const family = colorFamilies(v.replace(/^\[|\]$/g, ''))[0] ?? null;
  if (!family) return null;
  const op = /\/(\d+|\[[^\]]+\])$/.exec(v);
  const step = /-(\d{2,3})(?:\/|$)/.exec(v) ?? /^(?:[a-z]+)-(\d{2,3})/.exec(v);
  return {
    family,
    opacity: op ? op[1].replace(/\[|\]/g, '') : '',
    soft: /subtle|soft|tint|wash/.test(v),
    step: step ? step[1] : '',
  };
};

export function bgAccents(str) {
  const out = [];
  for (const m of str.matchAll(BG)) {
    const prefix = m[1];
    if (/(^|:)(hover|focus|active|group-hover|disabled|aria)/.test(prefix))
      continue;
    const parts = bgParts(m[2]);
    if (parts) out.push({ ...parts, token: m[0] });
  }
  return out;
}

const strTokens = toks => toks.filter(t => t.t === 'str');

/* ---------------------------------------------------------- (a) off-pack */

const OFF_VAR =
  /var\(--(geist-[a-z0-9-]+|color-accent-([a-z]+)[a-z0-9-]*|(?:[a-z0-9-]*-)?(?:indigo|violet|fuchsia|amber|yellow|lime|emerald|cyan|sky|rose)(?:-[a-z0-9-]*)?)/g;
const PACK_VAR_NAMES = new Set([
  'blue',
  'purple',
  'pink',
  'red',
  'orange',
  'green',
  'teal',
  'gray',
  'hover',
  'active',
  'foreground',
  'text',
  'subtle',
  'strong',
]);

export function offPackVarIds(text, file) {
  const ids = new Set();
  for (const m of text.matchAll(OFF_VAR)) {
    if (m[2] !== undefined && PACK_VAR_NAMES.has(m[2])) continue;
    if (m[1].startsWith('system-b')) continue;
    ids.add(`off-pack-var:${file}:--${m[1]}`);
  }
  return [...ids];
}

export function offPackTailwindIds(text, file) {
  const ids = new Set();
  for (const m of text.matchAll(TAILWIND_PALETTE))
    ids.add(`off-pack-tailwind:${file}:${m[1]}-${m[2]}-${m[3]}`);
  return [...ids];
}

function allowedHexSet(extra) {
  return new Set(extra.map(h => h.toLowerCase()));
}

export function offPackLiteralIds(toks, file, allowedHex) {
  const ids = new Set();
  const allowed = allowedHexSet(allowedHex);
  const regions = [];
  for (let k = 0; k < toks.length; k++) {
    if (
      toks[k].t === 'id' &&
      toks[k].v === 'style' &&
      toks[k + 1]?.v === '=' &&
      toks[k + 2]?.v === '{'
    ) {
      const end = matchClose(toks, k + 2);
      if (end > 0) regions.push(...strTokens(toks.slice(k + 3, end)));
    }
  }
  for (const tk of strTokens(toks))
    if (/-\[(?:#|rgba?\(|hsla?\(|oklch\()/.test(tk.v)) regions.push(tk);
  for (const tk of regions) {
    for (const m of tk.v.matchAll(COLOR_TOKEN)) {
      const t = m[0].toLowerCase();
      if (t.startsWith('var(')) continue;
      if (t.startsWith('#')) {
        const hex =
          t.length === 4
            ? `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`
            : t.slice(0, 7);
        if (!hexFamily(hex) || allowed.has(hex)) continue;
        ids.add(`off-pack-literal:${file}:${hex}`);
      } else {
        const fam = oneColorFamily(m[0]);
        if (!fam) continue;
        ids.add(`off-pack-literal:${file}:${t.replace(/\s+/g, '')}`);
      }
    }
  }
  return [...ids];
}

/* ------------------------------------------------------------ (b) gradient */

export function svgGradientIds(
  source,
  file,
  allow = GRADIENT_TWO_ACCENT_ALLOW
) {
  return svgGradientViolations(source, file, allow).map(
    v => `${v.rule}:${file}:${v.label}`
  );
}

export function gradientIds(strings, file, allow = GRADIENT_TWO_ACCENT_ALLOW) {
  const ids = new Set();
  for (const str of strings)
    for (const v of violationsOf(analyzeGradients(str), file, allow))
      ids.add(`${v.rule}:${file}:${v.label}`);
  return [...ids];
}

/* --------------------------------------------------- (c)(e) rotation lists */

const isObjectElement = el => el.some(t => t.t === 'p' && t.v === '{');

export function rotationIds(toks, source, file) {
  const ids = new Set();
  const arrays = arrayLiterals(toks);
  const guarded =
    /GREEN_RED_MIN_SET|\bminSet\b|getRotationAccent|expectedAccent/.test(
      source
    );
  let ordinal = 0;
  for (const arr of arrays) {
    if (arr.elements.length < 3) continue;
    if (STATUS_NAME.test(arr.name)) continue;
    const accents = arr.elements.map(elementAccent);
    const real = accents.filter(a => a && a !== 'neutral');
    if (real.length < 3 || real.length < accents.length * 0.6) continue;
    if (
      arr.elements.some(el =>
        isStatusRole(
          el.filter(
            t => !(t.t === 'str' && ACCENT_NAME[t.v.trim().toLowerCase()])
          )
        )
      )
    )
      continue;
    const label = arr.name || `array${ordinal}`;
    ordinal++;
    const seq = accents.filter(a => a && a !== 'neutral');
    const n = seq.length;
    const want = seq.map((_, idx) => expectedAccent(idx, n));
    if (seq.join() !== want.join())
      ids.add(`rotation-order:${file}:${label}:${seq.join('>')}`);
    for (let idx = 1; idx < n; idx++)
      if (seq[idx] === seq[idx - 1]) {
        ids.add(`adjacent-accent:${file}:${label}:${seq[idx]}@${idx}`);
        break;
      }
    const hasGreenRed = seq.some(a => a === 'mint' || a === 'red');
    if (hasGreenRed) {
      const items = arr.elements.some(isObjectElement);
      if (n < GREEN_RED_MIN_SET)
        ids.add(`mint-red-min-set:${file}:${label}:set-of-${n}`);
      else if (
        !items &&
        !guarded &&
        new RegExp(
          `\\b${arr.name.split(' ').pop() || '\\0'}\\s*(?:\\[|\\.at\\()`
        ).test(source)
      )
        ids.add(`mint-red-unguarded:${file}:${label}`);
    }
  }
  // helpers
  for (let k = 0; k < toks.length - 1; k++) {
    const tk = toks[k];
    if (tk.t !== 'id' || !ROTATION_HELPER_NAME.test(tk.v)) continue;
    const decl =
      toks[k - 1]?.v === 'function' ||
      (toks[k + 1]?.v === '=' && /^(const|let)$/.test(toks[k - 1]?.v));
    if (!decl) continue;
    let open = k + 1;
    while (
      open < toks.length &&
      !(toks[open].t === 'p' && toks[open].v === '{')
    )
      open++;
    const end = open < toks.length ? matchClose(toks, open) : -1;
    if (end === -1) continue;
    const body = toks.slice(open, end);
    const hasGreenRed = body.some(
      t => t.t === 'str' && /^(mint|red|green)$/i.test(t.v.trim())
    );
    const names = body.some(
      t =>
        t.t === 'id' &&
        /GREEN_RED_MIN_SET|minSet|ACCENT_ORDER|ROTATION_CORE|expectedAccent/.test(
          t.v
        )
    );
    if (hasGreenRed && !names)
      ids.add(`rotation-helper-no-threshold:${file}:${tk.v}`);
  }
  return [...ids];
}

/* ----------------------------------------------------- (d)(e)(f)(g) JSX */

const CONTAINER_TAG =
  /^(div|section|article|aside|main|header|footer|li|ul|nav|button|a|Card\w*|Panel\w*|Section\w*|Button\w*|Container\w*|Surface\w*)$/;
const DOT_SIZE =
  /(?<![\w-])(?:size|w|h)-(?:0\.5|1|1\.5|2|2\.5|3|\[(?:[0-9]|1[0-2])px\])(?![\w.])/;

function elementInfo(el) {
  const strs = strTokens(el.toks);
  const classes = strs.map(s => s.v).join(' ');
  const accents = [];
  const solids = [];
  for (const bg of bgAccents(classes)) {
    accents.push(bg);
    const soft =
      bg.soft ||
      (bg.opacity &&
        Number.parseInt(bg.opacity, 10) <= 12 &&
        /^\d+$/.test(bg.opacity));
    if (!soft) solids.push(bg);
  }
  for (const m of classes.matchAll(STOP)) {
    if (/(^|:)(hover|focus|active|group-hover|disabled)/.test(m[1])) continue;
    const fams = colorFamilies(m[3].replace(/_/g, ' '));
    for (const family of fams)
      accents.push({
        family,
        opacity: '',
        soft: true,
        step: '',
        token: m[0],
        gradient: true,
      });
  }
  // data-accent attribute
  for (let k = 0; k < el.toks.length - 2; k++) {
    const tk = el.toks[k];
    if (
      tk.t === 'id' &&
      tk.v === 'data-accent' &&
      el.toks[k + 1].v === '=' &&
      el.toks[k + 2].t === 'str'
    ) {
      const a = ACCENT_NAME[el.toks[k + 2].v.trim().toLowerCase()];
      if (a)
        accents.push({
          family: Object.keys(FAMILY_ACCENT).find(f => FAMILY_ACCENT[f] === a),
          opacity: '',
          soft: true,
          step: '',
          token: 'data-accent',
          attr: true,
        });
    }
    // style={{ background: '...' }}
    if (
      tk.t === 'id' &&
      /^background(Color|Image)?$/.test(tk.v) &&
      el.toks[k + 1].v === ':'
    ) {
      for (
        let m = k + 2;
        m < Math.min(k + 12, el.toks.length) && el.toks[m].v !== ',';
        m++
      ) {
        if (el.toks[m].t !== 'str') continue;
        const v = el.toks[m].v;
        if (/gradient\(/.test(v)) continue;
        const fam = colorFamilies(v)[0];
        if (!fam) continue;
        const soft =
          /subtle|soft|tint|rgba?\([^)]*,\s*0?\.(?:0\d?|1[0-2]?)\)|\/\s*0?\.?(?:0\d?|1[0-2]?)%?\)/.test(
            v
          );
        const item = {
          family: fam,
          opacity: '',
          soft,
          step: '',
          token: `style:${v.slice(0, 24)}`,
        };
        accents.push(item);
        if (!soft) solids.push(item);
      }
    }
  }
  const status = isStatusRole(el.toks) || STATUS_TAG.test(el.tag);
  const dot =
    DOT_SIZE.test(classes) || /dot/i.test(classes) || /dot/i.test(el.tag);
  return { tag: el.tag, accents, solids, status, dot, classes };
}

export function jsxIds(toks, file, { dataViz }) {
  const ids = new Set();
  const infos = jsxElements(toks).map(el => ({ el, ...elementInfo(el) }));
  const gradientFlagged = new Set();
  for (const info of infos) {
    if (gradientFamilies(info.classes).length) gradientFlagged.add(info);
  }
  const fileAccents = new Map(); // accent -> count (hardcoded, non-status, non-gradient-flagged)
  const peerFills = [];
  let hasGreenRedDecor = null;
  for (const info of infos) {
    if (!info.accents.length) continue;
    const rot = new Set(
      info.accents
        .map(a => a.family)
        .filter(f => f !== 'red' && f !== 'green' && f !== null)
    );
    if (!gradientFlagged.has(info) && rot.size >= 2 && !info.status)
      ids.add(
        `multi-accent-item:${file}:${[...rot].map(accentOf).sort().join('+')}`
      );
    // (g) solid fills on containers
    if (
      !info.status &&
      !dataViz &&
      !info.dot &&
      CONTAINER_TAG.test(info.tag) &&
      info.solids.length
    ) {
      const fams = [...new Set(info.solids.map(s => accentOf(s.family)))]
        .sort()
        .join('+');
      ids.add(`solid-accent-fill:${file}:${info.tag}:${fams}`);
    }
    if (info.status) continue;
    const fams = new Set(info.accents.map(a => a.family));
    for (const f of fams) {
      const a = accentOf(f);
      fileAccents.set(a, (fileAccents.get(a) ?? 0) + 1);
      if (f === 'green' || f === 'red')
        hasGreenRedDecor = hasGreenRedDecor
          ? hasGreenRedDecor.add(a)
          : new Set([a]);
    }
    if (
      fams.size === 1 &&
      info.accents.length === 1 &&
      !info.accents[0].attr &&
      !info.accents[0].gradient
    )
      peerFills.push({ accent: accentOf([...fams][0]), ...info.accents[0] });
  }
  const distinct = [...fileAccents.keys()];
  if (hasGreenRedDecor && distinct.length < GREEN_RED_MIN_SET)
    for (const a of hasGreenRedDecor)
      ids.add(`mint-red-min-set:${file}:${a}:${distinct.length}-accents`);
  const rotDistinct = distinct.filter(a => a !== 'red' && a !== 'mint');
  const hasItemFlag = [...ids].some(id => id.startsWith('multi-accent-item:'));
  if (!dataViz && !hasItemFlag && rotDistinct.length >= 2)
    ids.add(`multi-accent-file:${file}:${rotDistinct.sort().join('+')}`);
  // (f) equal weight among hardcoded peers of different accents
  const sig = p =>
    `${p.step || '-'}/${p.opacity || '-'}/${p.soft ? 'soft' : 'hard'}`;
  const peerAccents = new Set(peerFills.map(p => p.accent));
  if (peerAccents.size >= 2 && new Set(peerFills.map(sig)).size > 1)
    ids.add(
      `unequal-weight:${file}:jsx-peers:${[...new Set(peerFills.map(sig))].sort().join('|')}`
    );
  return [...ids];
}

/* (f) arrays and maps of class strings used as peers */
export function weightIds(toks, file) {
  const ids = new Set();
  const groups = [];
  for (const arr of arrayLiterals(toks))
    if (!STATUS_NAME.test(arr.name))
      groups.push({
        name: arr.name || 'array',
        items: arr.elements.map(el =>
          strTokens(el)
            .map(s => s.v)
            .join(' ')
        ),
      });
  for (let k = 0; k < toks.length; k++) {
    if (
      toks[k].v !== '{' ||
      toks[k].t !== 'p' ||
      (toks[k - 1]?.v !== '=' &&
        toks[k - 1]?.v !== ':' &&
        toks[k - 1]?.v !== '(')
    )
      continue;
    const end = matchClose(toks, k);
    if (end === -1 || end - k > 400) continue;
    const inner = toks.slice(k + 1, end);
    const props = [];
    let cur = [];
    let depth = 0;
    for (const it of inner) {
      if (it.t === 'p' && '([{'.includes(it.v)) depth++;
      if (it.t === 'p' && ')]}'.includes(it.v)) depth--;
      if (it.t === 'p' && it.v === ',' && depth === 0) {
        props.push(cur);
        cur = [];
        continue;
      }
      cur.push(it);
    }
    if (cur.length) props.push(cur);
    const keyed = props.filter(
      p =>
        p[0] &&
        (p[0].t === 'id' || p[0].t === 'str') &&
        p[1]?.v === ':' &&
        ACCENT_NAME[String(p[0].v).toLowerCase()]
    );
    if (keyed.length >= 3 && !STATUS_NAME.test(toks[k - 2]?.v ?? ''))
      groups.push({
        name: `map@${toks[k - 2]?.v ?? ''}`,
        items: keyed.map(p =>
          strTokens(p.slice(2))
            .map(s => s.v)
            .join(' ')
        ),
      });
  }
  for (const g of groups) {
    const fills = g.items
      .map(s => bgAccents(s))
      .filter(list => list.length === 1)
      .map(l => l[0]);
    if (fills.length < 3 || fills.length < g.items.length * 0.6) continue;
    const accents = new Set(fills.map(f => f.family));
    if (accents.size < 2) continue;
    const sig = new Set(
      fills.map(
        p => `${p.step || '-'}/${p.opacity || '-'}/${p.soft ? 'soft' : 'hard'}`
      )
    );
    if (sig.size > 1)
      ids.add(`unequal-weight:${file}:${g.name}:${[...sig].sort().join('|')}`);
  }
  return [...ids];
}

/* ------------------------------------------------------------------- CSS */

function cssRules(text) {
  const rules = [];
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    rules.push({ selector: m[1].trim().replace(/\s+/g, ' '), body: m[2] });
  return rules;
}

const CSS_SMALL =
  /dot|badge|pill|chip|swatch|bar|indicator|marker|track|fill|thumb|ring|glow|line|status|avatar|icon|tint|wash|halo|stroke|border|underline|edge/i;

export function cssIds(
  text,
  file,
  { tokenSource, gradientAllow = GRADIENT_TWO_ACCENT_ALLOW }
) {
  const ids = new Set();
  if (!tokenSource) {
    for (const id of offPackVarIds(text, file)) ids.add(id);
    for (const id of offPackTailwindIds(text, file)) ids.add(id);
  }
  for (const id of gradientIds([text], file, gradientAllow)) ids.add(id);
  for (const id of svgGradientIds(text, file, gradientAllow)) ids.add(id);
  for (const rule of cssRules(text)) {
    const bg = [
      ...rule.body.matchAll(
        /(?:^|;|\s)background(?:-color|-image)?\s*:\s*([^;]+)/g
      ),
    ].map(m => m[1].trim());
    const flat = bg.filter(v => !/gradient\(/.test(v));
    const fams = new Set();
    for (const v of flat)
      for (const f of colorFamilies(v))
        if (f !== 'red' && f !== 'green') fams.add(f);
    if (fams.size >= 2)
      ids.add(
        `multi-accent-item:${file}:${rule.selector.slice(0, 60)}:${[...fams].map(accentOf).sort().join('+')}`
      );
    if (
      CSS_SMALL.test(rule.selector) ||
      /^@|^from|^to|^\d+%/.test(rule.selector)
    )
      continue;
    for (const v of flat) {
      // solid: pack hex or a non-soft accent var; soft means subtle/soft names or alpha <= .12
      const solid = [
        ...v.matchAll(
          /#[0-9a-fA-F]{6}\b|var\(--(?:color-accent|noir-ion)-[a-z]+\)/g
        ),
      ].filter(m => colorFamilies(m[0]).length && !/subtle|soft/.test(m[0]));
      if (
        solid.length &&
        !/\balpha\b|\/\s*0?\.?(?:0\d?|1[0-2]?)\)|,\s*0?\.(?:0\d?|1[0-2]?)\)/.test(
          v
        ) &&
        !/color-mix/.test(v)
      ) {
        ids.add(`solid-accent-fill:${file}:${rule.selector.slice(0, 60)}`);
        break;
      }
    }
  }
  return [...ids];
}

/* ----------------------------------------------------------- file scanner */

export function scanSource(source, file, options) {
  const {
    allowedHex,
    tokenSource = false,
    gradientAllow = GRADIENT_TWO_ACCENT_ALLOW,
  } = options;
  const ext = file.slice(file.lastIndexOf('.'));
  if (ext === '.css') {
    const text = source.replace(/\/\*[\s\S]*?\*\//g, '');
    return cssIds(text, file, { tokenSource, gradientAllow });
  }
  const toks = tokenize(source);
  const strings = strTokens(toks).map(t => t.v);
  const joined = strings.join('\n');
  /** @type {string[]} */
  const ids = [];
  if (!tokenSource) {
    ids.push(
      ...offPackTailwindIds(joined, file),
      ...offPackVarIds(joined, file)
    );
    if (ext === '.tsx' || ext === '.jsx')
      ids.push(...offPackLiteralIds(toks, file, allowedHex));
  }
  ids.push(
    ...gradientIds(strings, file, gradientAllow),
    ...svgGradientIds(source, file, gradientAllow)
  );
  ids.push(...rotationIds(toks, source, file));
  ids.push(...weightIds(toks, file));
  if (ext === '.tsx' || ext === '.jsx')
    ids.push(...jsxIds(toks, file, { dataViz: DATA_VIZ_PATH.test(file) }));
  return [...new Set(ids)];
}
