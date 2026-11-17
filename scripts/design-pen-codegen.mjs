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
import {
  CodegenError,
  classifyText,
  DEFAULT_RULES_PATH,
  flatText,
  loadTokenColors,
  parseHtml,
  parseStyle,
  px,
  resolveColor,
  sp,
  textLines,
  walk,
} from './design-pen-codegen-core.mjs';
import {
  emit,
  exportAsset,
  exportFromPen,
  mergeRules,
} from './design-pen-codegen-emit.mjs';

export * from './design-pen-codegen-core.mjs';
export * from './design-pen-codegen-emit.mjs';

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
