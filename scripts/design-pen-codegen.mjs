#!/usr/bin/env node
/**
 * Pen -> React section codegen (pipeline contract section 5).
 *
 *   pnpm design:pen-codegen --file <pen> --node <id> --section <name> --out <tsx>
 *   pnpm design:pen-codegen --export-html <html-css export> --section <name> --out <tsx>
 *
 * Deterministic first: the Pen `html-css` export is parsed, every raw color is
 * resolved to a design.tokens.json semantic token, every text style to a DS type
 * utility, buttons to the DS Button, absolute boxes to a 12-column CSS grid.
 * Anything the rules cannot decide is collected and the run FAILS with the list;
 * a model pass (or a human) answers by adding a reviewed entry to a rules file
 * (`--rules`), never by hand-editing generated output. Guide:
 * .claude/skills/design-system/guides/code-parity.md
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
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

const px = v => {
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

const hex = c =>
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

const flatText = n =>
  n.tag === '#text'
    ? n.text
    : n.tag === 'br'
      ? '\n'
      : (n.children ?? []).map(flatText).join('');

function walk(n, f) {
  f(n);
  for (const c of n.children ?? []) walk(c, f);
}

const num = v => (Number.isInteger(v) ? String(v) : String(+v.toFixed(4)));

/** Tailwind spacing-scale number for px (unit 4px), e.g. 232 -> "58". */
const sp = pxv => num(pxv / 4);

function jsxText(lines) {
  const out = lines.map(l => {
    const t = l.trim();
    return /[{}<>'"&]/.test(t) ? `{${JSON.stringify(t)}}` : t;
  });
  return out;
}

// ---------------------------------------------------------------- the engine

function textLines(node) {
  const lines = [''];
  for (const c of node.children) {
    if (c.tag === 'br') lines.push('');
    else lines[lines.length - 1] += flatText(c);
  }
  return lines.map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function classifyText(node, st, ctx) {
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

/** Build the section IR + problems from a parsed export. */
export function convert(parsed, { section, rules, tokens }) {
  const problems = [];
  const snaps = [];
  const warnings = [];
  const frame = parsed.children.find(c => c.tag === 'div');
  if (!frame)
    throw new CodegenError([
      { kind: 'input', message: 'no root frame in export' },
    ]);
  const fs = parseStyle(frame.attrs.style);
  const W = px(fs.width);
  const H = px(fs.height);
  const g = rules.grid;
  const base = { problems, snaps, rules, tokens };
  if (W !== g.viewport)
    warnings.push(
      `frame width ${W} is not the ${g.viewport} grid viewport; grid math assumes ${g.viewport}`
    );

  const rootCls = ['relative', 'isolate', 'overflow-hidden'];
  const bg = resolveColor(fs['background-color'] ?? 'transparent', 'bg', {
    ...base,
    where: `${section} root`,
  });
  if (bg) rootCls.push(bg.utility);
  rootCls.push(`min-h-${sp(H)}`);

  const colW =
    (g.viewport - 2 * g.margin - (g.columns - 1) * g.gutter) / g.columns;
  const pitch = colW + g.gutter;
  const items = [];
  let image = null;
  const assets = [];
  const skipped = [];

  for (const child of frame.children.filter(c => c.tag === 'div')) {
    const st = parseStyle(child.attrs.style);
    const name =
      child.attrs['data-pencil-name'] ?? child.attrs['data-pencil-id'];
    const id = child.attrs['data-pencil-id'];
    const where = `${name} (${id})`;
    const rect = {
      x: px(st.left),
      y: px(st.top),
      w: px(st.width),
      h: px(st.height),
    };
    const comp = rules.components.find(c => {
      const re = new RegExp(c.match);
      let hit = re.test(name);
      if (!hit)
        walk(child, n => {
          if (n.attrs && re.test(n.attrs['data-pencil-name'] ?? '')) hit = true;
        });
      return hit;
    });
    if (comp?.action === 'layout-provided') {
      skipped.push({
        id,
        name,
        reason: 'rendered by the shared marketing layout',
      });
      continue;
    }
    const bgImg = /url\(['"]?([^'")]+)['"]?\)/.exec(
      st['background-image'] ?? ''
    );
    if (bgImg) {
      const full = rect.x === 0 && rect.y === 0 && rect.w === W && rect.h === H;
      if (!full || child.children.length) {
        problems.push({
          kind: 'layout',
          message: `${where}: image layer is not a childless full-bleed cover; only that shape is deterministic`,
        });
        continue;
      }
      if (image)
        problems.push({
          kind: 'layout',
          message: `${where}: second background image; only one is supported`,
        });
      image = {
        id,
        file: bgImg[1],
        fit:
          st['background-size'] === 'cover' ? 'object-cover' : 'object-contain',
      };
      assets.push({ id, file: bgImg[1] });
      continue;
    }
    if (comp?.action === 'Button' && rect.w === null) rect.w = 0;
    if (rect.x === null || rect.y === null || rect.w === null) {
      problems.push({
        kind: 'layout',
        message: `${where}: not absolutely positioned with px left/top/width`,
      });
      continue;
    }
    // column math
    const dx = rect.x - g.margin;
    const col = Math.round(dx / pitch);
    const resid = dx - col * pitch;
    if (col < 0 || col >= g.columns)
      problems.push({
        kind: 'layout',
        message: `${where}: x=${rect.x} outside the grid`,
      });
    if (Math.abs(resid) > g.spanTolerancePx)
      problems.push({
        kind: 'layout',
        message: `${where}: x=${rect.x} is ${resid}px off the nearest column edge (${g.margin + col * pitch}); fix in Pen`,
      });
    else if (Math.abs(resid) > g.offGridWarnPx)
      warnings.push(
        `${where}: x=${rect.x} is ${resid}px off the column edge ${g.margin + col * pitch}; snapped (Pen alignment defect)`
      );
    const span = Math.max(1, Math.ceil((rect.w + g.gutter - 0.5) / pitch));
    const spanW = span * pitch - g.gutter;
    const item = { id, name, where, rect, col: col + 1, span, spanW };

    if (comp?.action === 'Button') {
      let label = '';
      walk(child, n => {
        if (n.attrs?.['data-pencil-name'] === 'Button label')
          label = flatText(n).trim();
      });
      const href = rules.links[label];
      if (!label)
        problems.push({
          kind: 'component',
          message: `${where}: Button without a "Button label" text`,
        });
      if (!href)
        problems.push({
          kind: 'component',
          message: `${where}: Button "${label}" needs a destination; add links["${label}"] to a rules file`,
        });
      let ph = null;
      walk(child, n => {
        if (
          n.attrs &&
          /Primary . visible pill/.test(n.attrs['data-pencil-name'] ?? '')
        )
          ph = px(parseStyle(n.attrs.style).height);
      });
      if (ph && ph !== 28)
        warnings.push(
          `${where}: Pen draws the button ${ph}px tall; DS Button ${comp.props.size} renders a 28px face with a 44px hit target. Box height is preserved, the face is centered.`
        );
      item.kind = 'button';
      item.label = label;
      item.href = href;
      item.props = comp.props;
      const ws = parseStyle(child.attrs.style);
      const pad = String(ws.padding ?? '0px')
        .split(/\s+/)
        .map(px);
      const padY = (pad[0] ?? 0) + (pad[2] ?? pad[0] ?? 0);
      item.h = rect.h ?? (ph ? ph + padY : null);
      item.span = 3;
      if (item.h === null)
        problems.push({
          kind: 'layout',
          message: `${where}: button height cannot be derived`,
        });
    } else {
      const hasElementChild = child.children.some(
        c => c.tag !== '#text' && c.tag !== 'br'
      );
      if (hasElementChild) {
        problems.push({
          kind: 'unresolved',
          message: `${where}: nested layout with no component rule; needs a rules entry or a model pass`,
        });
        continue;
      }
      const ctx = { ...base, where };
      const t = classifyText(child, st, ctx);
      const color = resolveColor(st.color ?? '', 'text', ctx);
      if (color) t.cls.push(color.utility);
      const lines = textLines(child);
      const lh = px(st['line-height']);
      item.kind = 'text';
      item.tag = t.tag;
      item.cls = t.cls;
      item.lines = lines;
      item.h = lh ? lines.length * lh : null;
      if (t.role && item.h) t.cls.push(`min-h-${sp(item.h)}`);
      if (lines.length === 1 && rect.w > spanW)
        warnings.push(`${where}: single-line text wider than its span`);
      if (
        lines.length > 1 &&
        !child.children.some(c => c.tag === 'br') &&
        spanW > rect.w + 1
      )
        warnings.push(
          `${where}: wrapping text widened ${rect.w}->${spanW}px by the grid; check the line breaks`
        );
      if (rect.w !== spanW && spanW - rect.w > pitch)
        warnings.push(`${where}: span grew ${spanW - rect.w}px`);
    }
    items.push(item);
  }

  // vertical flow
  items.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  /** @type {number | null} */
  let prevBottom = null;
  items.forEach((it, i) => {
    it.row = i + 1;
    if (it.h == null) return;
    if (i === 0) it.gap = null;
    else {
      const gap = it.rect.y - (prevBottom ?? it.rect.y);
      if (gap < 0)
        problems.push({
          kind: 'layout',
          message: `${it.where}: overlaps the previous item by ${-gap}px (z-stacked layers need a rules entry)`,
        });
      it.gap = gap;
      if (gap % 4 !== 0)
        warnings.push(`${it.where}: ${gap}px gap is off the 4px spacing grid`);
    }
    prevBottom = it.rect.y + it.h;
  });
  const first = items[0];
  const pt = first ? first.rect.y : 0;
  const pb = prevBottom == null ? 0 : Math.max(0, H - prevBottom);
  if (pt % 4) warnings.push(`section top offset ${pt}px is off the 4px grid`);

  return {
    section,
    W,
    H,
    rootCls,
    image,
    items,
    pt,
    pb,
    assets,
    skipped,
    snaps,
    warnings,
    problems,
    grid: { colW, pitch },
  };
}

// ------------------------------------------------------------------- emitter

const pascal = s => s.replace(/(^|[-_ ]+)(\w)/g, (_, __, c) => c.toUpperCase());

export function emit(ir, { source, sourceHash, publicBase }) {
  const hasButton = ir.items.some(i => i.kind === 'button');
  const lines = [];
  lines.push(
    `// Generated by pnpm design:pen-codegen from ${source} (export sha256 ${sourceHash.slice(0, 12)}). Do not edit by hand: change Pen or the rules file and regenerate.`
  );
  if (ir.image) lines.push("import Image from 'next/image';");
  if (hasButton) lines.push("import Link from 'next/link';");
  if (hasButton) lines.push("import { Button } from '@jovie/ui';");
  lines.push('');
  lines.push(`export function Pen${pascal(ir.section)}Section() {`);
  lines.push('  return (');
  lines.push(
    `    <section data-pen-section='${ir.section}' className='${ir.rootCls.join(' ')}'>`
  );
  if (ir.image) {
    const src = `${publicBase}/${ir.image.file.replace(/^\.?\//, '')}`;
    lines.push('      <Image');
    lines.push(`        src='${src}'`);
    lines.push("        alt=''");
    lines.push('        fill');
    lines.push('        priority');
    lines.push("        sizes='100vw'");
    lines.push(`        className='-z-10 ${ir.image.fit} object-center'`);
    lines.push('      />');
  }
  const grid = [
    'mx-auto',
    'grid',
    'w-full',
    `max-w-${sp(ir.W)}`,
    `grid-cols-${12}`,
    'content-start',
    'gap-x-6',
    `px-${sp(96)}`,
  ];
  if (ir.pt) grid.push(`pt-${sp(ir.pt)}`);
  if (ir.pb) grid.push(`pb-${sp(ir.pb)}`);
  lines.push(`      <div className='${grid.join(' ')}'>`);
  for (const it of ir.items) {
    const place = [
      `col-start-${it.col}`,
      `col-span-${it.span}`,
      `row-start-${it.row}`,
    ];
    if (it.gap) place.push(`mt-${sp(it.gap)}`);
    if (it.kind === 'text') {
      const cls = [...place, ...it.cls].join(' ');
      const body = jsxText(it.lines);
      lines.push(`        <${it.tag} className='${cls}'>`);
      body.forEach((l, i) => {
        lines.push(`          ${l}${i < body.length - 1 ? '' : ''}`);
        if (i < body.length - 1) lines.push('          <br />');
      });
      lines.push(`        </${it.tag}>`);
    } else {
      lines.push(
        `        <div className='${[...place, 'flex', 'items-center', `h-${sp(it.h)}`].join(' ')}'>`
      );
      lines.push(
        `          <Button asChild variant='${it.props.variant}' size='${it.props.size}'>`
      );
      lines.push(`            <Link href='${it.href}'>${it.label}</Link>`);
      lines.push('          </Button>');
      lines.push('        </div>');
    }
  }
  lines.push('      </div>');
  lines.push('    </section>');
  lines.push('  );');
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

// ----------------------------------------------------------------------- IO

function mergeRules(base, extra) {
  const r = structuredClone(base);
  for (const k of ['colorOverrides', 'typeOverrides', 'links'])
    Object.assign(r[k], extra[k] ?? {});
  for (const k of ['components', 'typeRoles'])
    r[k] = [...(extra[k] ?? []), ...r[k]];
  return r;
}

function pen(args) {
  const r = spawnSync('pen', ['interactive', '-a', 'desktop'], {
    input: `${args}\nexit()\n`,
    encoding: 'utf8',
    timeout: 120000,
  });
  return `${r.stdout ?? ''}${r.stderr ?? ''}`;
}

/** Export through the attached Pen desktop app. Read-only on the .pen file. */
export function exportFromPen({ file, node, dir }) {
  let state = pen('get_app_state()');
  if (!state.includes('Currently active canvas'))
    state = pen('get_app_state()');
  if (
    !state.includes(encodeURI(basename(file))) &&
    !state.includes(basename(file))
  ) {
    throw new CodegenError([
      {
        kind: 'pen',
        message: `the attached Pen canvas is not ${basename(file)}; open it first (single-writer rule applies to writes, this is a read)`,
      },
    ]);
  }
  mkdirSync(dir, { recursive: true });
  const out = join(dir, 'index.html');
  const log = pen(
    `execute({ input: ${JSON.stringify(`Export([${JSON.stringify(node)}], "html-css", ${JSON.stringify(out)}, {includeLayerIds:true})`)} })`
  );
  if (!existsSync(out) || readFileSync(out, 'utf8').length === 0) {
    throw new CodegenError([
      {
        kind: 'pen',
        message: `export produced no file (Export can exit 0 without writing). Pen said: ${log.slice(-400)}`,
      },
    ]);
  }
  return out;
}

function exportAsset({ id, dir }) {
  pen(
    `execute({ input: ${JSON.stringify(`Export([${JSON.stringify(id)}], "webp", ${JSON.stringify(dir)}, {scale:1,quality:85})`)} })`
  );
  const p = join(dir, `${id}.webp`);
  return existsSync(p) ? p : null;
}

export function run(opts) {
  const rules = mergeRules(
    JSON.parse(readFileSync(DEFAULT_RULES_PATH, 'utf8')),
    opts.rules ? JSON.parse(readFileSync(opts.rules, 'utf8')) : {}
  );
  const tokens = loadTokenColors();
  const work = opts.workDir ?? mkdtempSync(join(tmpdir(), 'pen-codegen-'));
  const htmlPath = opts.exportHtml
    ? resolve(opts.exportHtml)
    : exportFromPen({ file: opts.file, node: opts.node, dir: work });
  const html = readFileSync(htmlPath, 'utf8');
  const sourceHash = createHash('sha256').update(html).digest('hex');
  const ir = convert(parseHtml(html), { section: opts.section, rules, tokens });

  // assets: copy what the export wrote; otherwise export the node as webp
  const publicDir = opts.publicDir ? resolve(opts.publicDir) : null;
  for (const a of ir.assets) {
    const ext = a.file.includes('.') ? a.file.split('.').pop() : 'webp';
    let src = join(dirname(htmlPath), a.file);
    if (!existsSync(src) && existsSync(join(dirname(htmlPath), `${a.id}.webp`)))
      src = join(dirname(htmlPath), `${a.id}.webp`);
    if (!existsSync(src) && !opts.exportHtml) {
      const exported = exportAsset({ id: a.id, dir: work });
      if (exported) src = exported;
    }
    if (!existsSync(src)) {
      ir.problems.push({
        kind: 'asset',
        message: `image ${a.file} (node ${a.id}) is missing next to the export`,
      });
      continue;
    }
    const finalName =
      src.endsWith('.webp') && !a.file.endsWith('.webp')
        ? a.file.replace(/\.\w+$/, '.webp')
        : a.file;
    if (ir.image?.id === a.id) ir.image.file = finalName;
    if (publicDir) {
      mkdirSync(publicDir, { recursive: true });
      copyFileSync(src, join(publicDir, finalName));
    }
    void ext;
  }
  if (ir.problems.length) throw new CodegenError(ir.problems);

  const publicBase = opts.publicBase ?? `/pen/${opts.section}`;
  const tsx = emit(ir, {
    source: opts.file
      ? `${basename(opts.file)}#${opts.node}`
      : basename(htmlPath),
    sourceHash,
    publicBase,
  });
  if (opts.out) {
    mkdirSync(dirname(resolve(opts.out)), { recursive: true });
    writeFileSync(resolve(opts.out), tsx);
  }
  const report = {
    schema: 'jovie.pen-codegen-report/v1',
    section: opts.section,
    sourceHash,
    items: ir.items.map(i => ({ id: i.id, kind: i.kind })),
    deterministic: {
      handled: ir.items.length + (ir.image ? 1 : 0),
      skippedByLayout: ir.skipped.length,
      unresolved: 0,
    },
    snaps: ir.snaps,
    warnings: ir.warnings,
    skipped: ir.skipped,
  };
  if (opts.report)
    writeFileSync(resolve(opts.report), `${JSON.stringify(report, null, 2)}\n`);
  return { tsx, report, ir };
}

function parseArgs(argv) {
  const o = {};
  const map = {
    '--file': 'file',
    '--node': 'node',
    '--section': 'section',
    '--out': 'out',
    '--export-html': 'exportHtml',
    '--rules': 'rules',
    '--public-dir': 'publicDir',
    '--public-base': 'publicBase',
    '--report': 'report',
    '--work-dir': 'workDir',
  };
  for (let i = 0; i < argv.length; i++) {
    const k = map[argv[i]];
    if (!k) throw new Error(`unknown argument ${argv[i]}`);
    o[k] = argv[++i];
  }
  if (!o.section || !/^[a-z][a-z0-9-]*$/.test(o.section))
    throw new Error('--section <kebab-name> is required');
  if (!o.exportHtml && !(o.file && o.node))
    throw new Error('give --file <pen> --node <id>, or --export-html <path>');
  return o;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { report } = run(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(report, null, 2));
  } catch (e) {
    console.error(e instanceof CodegenError ? e.message : e);
    process.exit(e instanceof CodegenError ? 2 : 1);
  }
}
