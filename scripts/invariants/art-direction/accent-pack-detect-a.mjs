/** Accent pack detectors: element accent, gradients, off-pack colors, rotation order. Pure: source text in, violation ids out. */

import {
  accentOf,
  COLOR_TOKEN,
  colorFamilies,
  FAMILY_ACCENT,
  hexFamily,
  oneColorFamily,
  TAILWIND_PALETTE,
} from './accent-pack-color.mjs';
import {
  EXTRA_PACK_HEX,
  expectedAccent,
  GREEN_RED_MIN_SET,
  ROTATION_HELPER_NAME,
  STATUS_IDENT,
  STATUS_NAME,
  STATUS_VALUE,
} from './accent-pack-config.mjs';
import { arrayLiterals, matchClose } from './accent-pack-tokens.mjs';

export const ACCENT_NAME = {
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

export const isStatusRole = toks =>
  toks.some(
    tk =>
      (tk.t === 'id' && STATUS_IDENT.test(tk.v)) ||
      (tk.t === 'str' && STATUS_VALUE.test(tk.v.trim()))
  );

/* -------------------------------------------------------------- utilities */

export const STOP =
  /(?<![\w-])((?:[\w[\]-]+:)*)(from|via|to)-(\[[^\]]+\]|[\w./%-]+)/g;
const BG = /(?<![\w-])((?:[\w[\]-]+:)*)bg-(\[[^\]]+\]|[\w./%-]+)/g;

export function gradientFamilies(str) {
  const groups = new Map();
  for (const m of str.matchAll(STOP)) {
    const fams = colorFamilies(m[3].replace(/_/g, ' '));
    if (!fams.length) continue;
    const key = m[1];
    const list = groups.get(key) ?? [];
    for (const f of fams) if (!list.includes(f)) list.push(f);
    groups.set(key, list);
  }
  const out = [];
  for (const list of groups.values()) if (list.length >= 2) out.push(list);
  // css gradients
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
    const fams = colorFamilies(str.slice(start, j));
    if (fams.length >= 2) out.push(fams);
  }
  return out;
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

export const strTokens = toks => toks.filter(t => t.t === 'str');

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

export function gradientIds(strings, file) {
  const ids = new Set();
  for (const s of strings) {
    for (const fams of gradientFamilies(s))
      ids.add(
        `two-tone-gradient:${file}:${[...fams].map(accentOf).sort().join('+')}`
      );
  }
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
