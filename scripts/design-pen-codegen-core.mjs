/**
 * pen-codegen core: HTML/CSS parse, color resolution and text classification.
 * Split from design-pen-codegen.mjs (size-500).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
export const DEFAULT_RULES_PATH = join(HERE, 'design-pen-codegen.rules.json');
export const TOKENS_PATH = join(REPO_ROOT, 'design.tokens.json');

/** Collects every undecidable item so one run reports all of them. */
export class CodegenError extends Error {
  constructor(problems) {
    super(
      `pen-codegen cannot decide ${problems.length} item(s):\n` +
        problems.map(p => `  - [${p.kind}] ${p.message}`).join('\n')
    );
    this.problems = problems;
  }
}

// ---------------------------------------------------------------- html parse

const VOID = new Set(['br', 'path', 'img', 'meta', 'link', 'circle', 'rect']);

function parseAttrs(src) {
  const attrs = {};
  const re = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
  let m = re.exec(src);
  while (m) {
    attrs[m[1]] = m[2] ?? m[3] ?? '';
    m = re.exec(src);
  }
  return attrs;
}

/** Minimal parser for the regular subset Pen emits (div, svg, br, text). */
export function parseHtml(html) {
  const body = html.includes('<body')
    ? html.slice(html.indexOf('>', html.indexOf('<body')) + 1)
    : html;
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re =
    /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g;
  let m = re.exec(body);
  while (m) {
    const top = stack[stack.length - 1];
    if (m[5] !== undefined) {
      const text = m[5].replace(/\s+/g, ' ');
      if (text.trim()) top.children.push({ tag: '#text', text });
    } else if (m[2]) {
      const tag = m[2].toLowerCase();
      if (m[1]) {
        if (stack.length > 1 && stack[stack.length - 1].tag === tag)
          stack.pop();
      } else {
        const node = { tag, attrs: parseAttrs(m[3]), children: [] };
        top.children.push(node);
        if (!VOID.has(tag) && !m[4]) stack.push(node);
      }
    }
    m = re.exec(body);
  }
  return root;
}

export function parseStyle(style = '') {
  const out = {};
  let depth = 0;
  let quote = '';
  let cur = '';
  const parts = [];
  for (const ch of style) {
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ';' && depth === 0 && !quote) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  for (const p of parts) {
    const i = p.indexOf(':');
    if (i > 0) out[p.slice(0, i).trim().toLowerCase()] = p.slice(i + 1).trim();
  }
  return out;
}

export const px = v => {
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec(String(v ?? '').trim());
  return m ? Number(m[1]) : null;
};

// -------------------------------------------------------------------- colors

export function parseColor(value) {
  const v = String(value).trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(v);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
    if (h.length === 6) h += 'ff';
    if (h.length !== 8) return null;
    return {
      r: Number.parseInt(h.slice(0, 2), 16),
      g: Number.parseInt(h.slice(2, 4), 16),
      b: Number.parseInt(h.slice(4, 6), 16),
      a: Number.parseInt(h.slice(6, 8), 16) / 255,
    };
  }
  m = /^rgba?\(([^)]+)\)$/.exec(v);
  if (m) {
    const [r, g, b, a = '1'] = m[1].split(/[,\s/]+/).filter(Boolean);
    return { r: +r, g: +g, b: +b, a: +a };
  }
  return null;
}

export const hex = c =>
  `#${[c.r, c.g, c.b].map(n => Math.round(n).toString(16).padStart(2, '0')).join('')}`;

function oklab({ r, g, b }) {
  const lin = c => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function distance(a, b) {
  const [x, y] = [oklab(a), oklab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/** Token table: opaque hex -> first token name, in design.tokens.json order. */
export function loadTokenColors(tokensPath = TOKENS_PATH) {
  const tokens = JSON.parse(readFileSync(tokensPath, 'utf8')).color;
  const byHex = new Map();
  const list = [];
  for (const [name, def] of Object.entries(tokens)) {
    const c = parseColor(def.$value);
    if (!c || c.a !== 1) continue;
    list.push({ name, color: c });
    if (!byHex.has(hex(c))) byHex.set(hex(c), name);
  }
  return { byHex, list };
}

/**
 * Resolve a raw Pen color to a semantic token and the Tailwind utility for the
 * given role (bg/text/border). Returns { token, utility, snapped } or records a
 * problem. An unmapped raw color is NEVER emitted.
 */
export function resolveColor(raw, role, ctx) {
  const c = parseColor(raw);
  if (!c) {
    ctx.problems.push({ kind: 'color', message: `unparseable color "${raw}"` });
    return null;
  }
  if (c.a === 0) return null; // fully transparent: no class
  const key = hex(c);
  let token = c.a === 1 ? ctx.tokens.byHex.get(key) : undefined;
  let snapped = null;
  if (!token) {
    const o =
      ctx.rules.colorOverrides[key] ??
      ctx.rules.colorOverrides[
        `${key}${Math.round(c.a * 255)
          .toString(16)
          .padStart(2, '0')}`
      ];
    if (o) {
      token = o.token;
      snapped = { from: key, to: token, reason: o.reason ?? '', kind: 'color' };
    }
  }
  if (!token) {
    const near = ctx.tokens.list
      .map(t => ({ name: t.name, d: distance(c, t.color) }))
      .sort((a, b) => a.d - b.d)[0];
    ctx.problems.push({
      kind: 'color',
      message: `raw color ${key} (alpha ${c.a.toFixed(2)}) on ${ctx.where} has no semantic token; nearest is ${near.name} (OKLab distance ${near.d.toFixed(3)}). Fix it in Pen, or add a reviewed colorOverrides entry.`,
    });
    return null;
  }
  const util = ctx.rules.colorUtilities[token]?.[role];
  if (!util) {
    ctx.problems.push({
      kind: 'color',
      message: `token ${token} has no ${role} utility in colorUtilities (${ctx.where})`,
    });
    return null;
  }
  if (snapped) ctx.snaps.push({ ...snapped, where: ctx.where });
  return { token, utility: `${role}-${util}` };
}

// ------------------------------------------------------------------- helpers

export const flatText = n =>
  n.tag === '#text'
    ? n.text
    : n.tag === 'br'
      ? '\n'
      : (n.children ?? []).map(flatText).join('');

export function walk(n, f) {
  f(n);
  for (const c of n.children ?? []) walk(c, f);
}

export const num = v =>
  Number.isInteger(v) ? String(v) : String(+v.toFixed(4));

/** Tailwind spacing-scale number for px (unit 4px), e.g. 232 -> "58". */
export const sp = pxv => num(pxv / 4);

export function jsxText(lines) {
  const out = lines.map(l => {
    const t = l.trim();
    return /[{}<>'"&]/.test(t) ? `{${JSON.stringify(t)}}` : t;
  });
  return out;
}

// ---------------------------------------------------------------- the engine

export function textLines(node) {
  const lines = [''];
  for (const c of node.children) {
    if (c.tag === 'br') lines.push('');
    else lines[lines.length - 1] += flatText(c);
  }
  return lines.map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

export function classifyText(node, st, ctx) {
  const family = (st['font-family'] ?? '')
    .split(',')[0]
    .replace(/["']/g, '')
    .trim()
    .toLowerCase();
  const size = px(st['font-size']);
  const weight = String(st['font-weight'] ?? '400');
  const lh = px(st['line-height']);
  const ls = px(st['letter-spacing']) ?? 0;
  const role = ctx.rules.typeRoles.find(
    r => r.family === family && size >= r.minSize && size <= r.maxSize
  );
  const cls = [];
  let tag = 'p';
  if (role) {
    cls.push(role.classes);
    tag = role.tag ?? 'p';
    ctx.snaps.push({
      kind: 'type',
      where: ctx.where,
      from: `${family} ${size}/${lh ?? 'normal'} w${weight} ls${ls}`,
      to: `role ${role.name}`,
      reason: 'DS display role replaces Pen size, leading and tracking',
    });
    const w = ctx.rules.fontWeights[weight];
    if (w) cls.push(w);
    return { tag, cls, role: role.name };
  }
  const famClass = ctx.rules.fontFamilies[family];
  if (!famClass) {
    ctx.problems.push({
      kind: 'type',
      message: `font family "${family}" not in fontFamilies (${ctx.where})`,
    });
    return { tag, cls };
  }
  let sizeClass = ctx.rules.fontSizes[String(size)];
  const ov = ctx.rules.typeOverrides[`${family}:${size}`];
  if (!sizeClass && ov) {
    sizeClass = ov.size;
    ctx.snaps.push({
      kind: 'type',
      where: ctx.where,
      from: `${family} ${size}px`,
      to: ov.size,
      reason: ov.reason ?? '',
    });
  }
  if (!sizeClass) {
    ctx.problems.push({
      kind: 'type',
      message: `${family} ${size}px (${ctx.where}) is not on the DS type scale ${Object.keys(ctx.rules.fontSizes).join('/')}; fix in Pen or add a typeOverrides "${family}:${size}" entry`,
    });
  }
  const w = ctx.rules.fontWeights[weight];
  if (!w)
    ctx.problems.push({
      kind: 'type',
      message: `font weight ${weight} unmapped (${ctx.where})`,
    });
  if (ls !== 0)
    ctx.problems.push({
      kind: 'type',
      message: `letter-spacing ${ls}px on non-display text (${ctx.where}) has no DS tracking utility`,
    });
  cls.push(famClass, sizeClass, w);
  if (lh) cls.push(`leading-${sp(lh)}`);
  else
    ctx.problems.push({
      kind: 'layout',
      message: `line-height is "${st['line-height']}" (${ctx.where}); Pen text needs an explicit px line-height to be placed on the grid`,
    });
  return { tag, cls: cls.filter(Boolean) };
}
