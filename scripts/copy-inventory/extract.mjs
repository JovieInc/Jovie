#!/usr/bin/env node
// Copy inventory: every visible copy line on the public marketing routes as a
// row {id, route, section, role, text, source}. IDs are short and speakable
// ("HOME-3") and stable: they are assigned once, keyed on the source (file +
// text, or a content-record field), and committed in ids.gen.json. Re-running
// never renumbers; new lines get the next free number for their prefix.
//
//   node scripts/copy-inventory/extract.mjs          # write inventory + ids
//   node scripts/copy-inventory/extract.mjs --check  # exit 1 if stale
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import ts from 'typescript';
import { ROUTES, SITE_CHROME } from './routes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const WEB = join(REPO, 'apps/web');
export const IDS_PATH = join(HERE, 'ids.gen.json');
export const OUT_PATH = join(HERE, 'inventory.gen.json');

// Object keys whose string values are visible copy.
const COPY_KEYS = new Set([
  'title',
  'headline',
  'heading',
  'subhead',
  'subheading',
  'subtitle',
  'description',
  'body',
  'label',
  'cta',
  'action',
  'text',
  'summary',
  'question',
  'answer',
  'eyebrow',
  'caption',
  'note',
  'support',
  'alt',
  'tagline',
  'kicker',
  'lede',
  'intro',
  'cta_label',
  'ctaLabel',
  'buttonLabel',
  'placeholder',
  'badge',
  'detail',
  'message',
  'name',
  'overline',
  'hint',
  'bullets',
  'items',
  'points',
  'steps',
  'lines',
  'paragraphs',
  'copy',
]);
const JSX_COPY_ATTRS = new Set([
  'aria-label',
  'title',
  'placeholder',
  'alt',
  'label',
]);
const META_KEYS = new Set(['title', 'description']);
// Component dirs that hold primitives, not page copy.
const SKIP_DIRS = ['components/ui/', 'components/atoms/', 'components/icons/'];
const SKIP_FILE = /(\.test\.|\.stories\.|\.d\.ts$|\.gen\.|\.json$|\.css$)/;
const DATA_SKIP = [
  'data/marketing/',
  'data/product-truth/',
  'data/designSystem/',
];

const read = p => readFileSync(p, 'utf8');
const isCode = rel => /\.(tsx?|jsx?)$/.test(rel) && !SKIP_FILE.test(rel);

function resolveImport(spec, fromFile) {
  let base;
  if (spec.startsWith('@/')) {
    const rest = spec.slice(2);
    const alias = {
      features: 'components/features',
      atoms: 'components/atoms',
      molecules: 'components/molecules',
      organisms: 'components/organisms',
    };
    const head = rest.split('/')[0];
    base = join(WEB, alias[head] ? rest.replace(head, alias[head]) : rest);
  } else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null;
  for (const c of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]) {
    if (existsSync(c) && /\.(tsx?)$/.test(c)) return c;
  }
  return null;
}

function allowed(file) {
  const rel = relative(WEB, file);
  if (rel.startsWith('..') || !isCode(rel)) return false;
  if (SKIP_DIRS.some(d => rel.startsWith(d))) return false;
  if (DATA_SKIP.some(d => rel.startsWith(d))) return false;
  if (rel.startsWith('lib/'))
    return (
      /copy|content|labels/i.test(rel) &&
      !rel.startsWith('lib/content-records/')
    );
  return /^(app|components|data)\//.test(rel);
}

const parsed = new Map();
function parse(file) {
  if (!parsed.has(file)) {
    const src = read(file);
    parsed.set(
      file,
      ts.createSourceFile(
        file,
        src,
        ts.ScriptTarget.Latest,
        true,
        file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
      )
    );
  }
  return parsed.get(file);
}

function imports(file) {
  const out = [];
  const visit = n => {
    if (
      (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
      n.moduleSpecifier &&
      ts.isStringLiteral(n.moduleSpecifier)
    ) {
      if (ts.isImportDeclaration(n) && n.importClause?.isTypeOnly) return;
      const r = resolveImport(n.moduleSpecifier.text, file);
      if (r && allowed(r)) out.push(r);
    }
  };
  parse(file).statements.forEach(visit);
  return out;
}

/** Files reachable from entries, in discovery order (page first). */
function closure(entries, exclude = new Set()) {
  const seen = new Set();
  const order = [];
  const queue = entries.map(e => join(WEB, e)).filter(existsSync);
  while (queue.length) {
    const f = queue.shift();
    if (seen.has(f) || exclude.has(f)) continue;
    seen.add(f);
    order.push(f);
    queue.push(...imports(f));
  }
  return order;
}

const clean = s => s.replace(/\s+/g, ' ').trim();
function looksLikeCopy(text, strong) {
  if (!/[A-Za-z]/.test(text)) return false;
  if (/^(https?:|\/|#|mailto:|\.\.?\/)/.test(text)) return false;
  if (/^[a-z0-9_.:-]+$/.test(text)) return false; // identifier-ish
  if (/^[A-Z0-9_]+$/.test(text) && !text.includes(' ')) return false; // CONSTANT
  if (/^[a-z]+([A-Z][a-z0-9]*)+$/.test(text)) return false; // camelCase id
  if (
    /\b(px|rem|flex|grid|bg-|text-|border-)\b/.test(text) &&
    !/[.!?]$/.test(text)
  )
    return false;
  if (!strong && !text.includes(' ') && !/^[A-Z]/.test(text)) return false;
  return text.length >= 2;
}

function literalText(n) {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))
    return clean(n.text);
  if (ts.isTemplateExpression(n)) {
    return clean(
      n.head.text + n.templateSpans.map(s => `{…}${s.literal.text}`).join('')
    );
  }
  return null;
}

const tagRole = tag => {
  if (tag === 'h1') return 'h1';
  if (/^h[2-6]$/.test(tag)) return 'h2';
  if (
    ['button', 'a', 'Link', 'Button', 'ButtonLink', 'LinkButton'].includes(tag)
  )
    return 'cta';
  if (
    [
      'label',
      'Label',
      'span',
      'li',
      'th',
      'td',
      'dt',
      'small',
      'legend',
      'figcaption',
    ].includes(tag)
  )
    return 'label';
  return 'body';
};
const keyRole = (key, path) => {
  if (/headline|^title$|heading/i.test(key))
    return /seo|meta/i.test(path) ? 'meta' : 'h2';
  if (/cta|action|buttonLabel|^label$/i.test(key))
    return key === 'label' ? 'label' : 'cta';
  if (/placeholder|badge|alt|eyebrow|kicker|overline|hint|name/i.test(key))
    return 'label';
  if (/description/.test(key) && /seo|meta/i.test(path)) return 'meta';
  return 'body';
};

/** Rows from one file, in source order. */
function extractFile(file, recordMap) {
  const sf = parse(file);
  const rel = relative(REPO, file);
  const rows = [];
  const add = (node, text, role, section, extra = {}) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    rows.push({ text, role, section, file: rel, line: line + 1, ...extra });
  };
  const sectionOf = n => {
    for (let p = n; p; p = p.parent) {
      if ((ts.isFunctionDeclaration(p) || ts.isClassDeclaration(p)) && p.name)
        return p.name.text;
      if (
        ts.isVariableDeclaration(p) &&
        ts.isIdentifier(p.name) &&
        p.initializer &&
        (ts.isArrowFunction(p.initializer) ||
          ts.isFunctionExpression(p.initializer) ||
          ts.isCallExpression(p.initializer))
      )
        return p.name.text;
      if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name))
        return p.name.text;
    }
    return 'module';
  };
  const tagOf = n => {
    for (let p = n.parent; p; p = p.parent) {
      if (ts.isJsxElement(p)) return p.openingElement.tagName.getText(sf);
      if (ts.isJsxSelfClosingElement(p)) return p.tagName.getText(sf);
    }
    return null;
  };
  const inMetadata = n => {
    for (let p = n; p; p = p.parent) {
      if (ts.isVariableDeclaration(p) && p.name.getText(sf) === 'metadata')
        return true;
      if (ts.isFunctionDeclaration(p) && p.name?.text === 'generateMetadata')
        return true;
    }
    return false;
  };
  // Dotted path of property names from the enclosing top-level const.
  const objPath = n => {
    const parts = [];
    for (let p = n.parent; p; p = p.parent) {
      if (
        ts.isPropertyAssignment(p) &&
        (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))
      )
        parts.unshift(p.name.text);
      if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) {
        parts.unshift(p.name.text);
        break;
      }
    }
    return parts.join('.');
  };

  const visit = n => {
    if (ts.isJsxText(n)) {
      const t = clean(n.text);
      if (t && looksLikeCopy(t, true))
        add(n, t, tagRole(tagOf(n) ?? ''), sectionOf(n));
    } else if (
      ts.isJsxAttribute(n) &&
      n.initializer &&
      JSX_COPY_ATTRS.has(n.name.getText(sf))
    ) {
      const init = ts.isJsxExpression(n.initializer)
        ? n.initializer.expression
        : n.initializer;
      const t = init && literalText(init);
      if (t && looksLikeCopy(t, true)) add(n, t, 'label', sectionOf(n));
    } else if (
      ts.isJsxExpression(n) &&
      n.expression &&
      n.parent &&
      (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))
    ) {
      const t = literalText(n.expression);
      if (t && looksLikeCopy(t, true))
        add(n, t, tagRole(tagOf(n) ?? ''), sectionOf(n));
    } else if (
      ts.isPropertyAssignment(n) &&
      (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name)) &&
      COPY_KEYS.has(n.name.text)
    ) {
      const key = n.name.text;
      const emit = lit => {
        const t = literalText(lit);
        if (!t || !looksLikeCopy(t, true)) return;
        const path = objPath(lit);
        const meta = inMetadata(lit) && META_KEYS.has(key);
        add(lit, t, meta ? 'meta' : keyRole(key, path), sectionOf(lit), {
          path,
          record: recordMap.get(`${rel}:${path}`),
        });
      };
      const v = n.initializer;
      if (ts.isArrayLiteralExpression(v))
        v.elements.forEach(e =>
          ts.isObjectLiteralExpression(e) ? null : emit(e)
        );
      else emit(v);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  // Strings in `as const` data arrays of bare literals are covered above only
  // under COPY_KEYS; object-array members are visited via their own keys.
  return rows;
}

/** Map `file:path` -> `marketing-page/home#section.slot` from DEFAULT_HOME_SPEC. */
function recordSlots() {
  const map = new Map();
  const file = join(WEB, 'lib/content-records/marketing-page.ts');
  const sf = parse(file);
  const homepageCopy = 'apps/web/data/homepageCopy.ts';
  const visit = n => {
    if (ts.isObjectLiteralExpression(n)) {
      const sectionProp = n.properties.find(
        p => ts.isPropertyAssignment(p) && p.name.getText(sf) === 'section'
      );
      const copyProp = n.properties.find(
        p => ts.isPropertyAssignment(p) && p.name.getText(sf) === 'copy'
      );
      if (
        sectionProp &&
        copyProp &&
        ts.isObjectLiteralExpression(/** @type {any} */ (copyProp).initializer)
      ) {
        const section = /** @type {any} */ (sectionProp).initializer.text;
        for (const slot of /** @type {any} */ (copyProp).initializer
          .properties) {
          if (!ts.isPropertyAssignment(slot)) continue;
          const m = /^HOMEPAGE_COPY\.(.+)$/.exec(slot.initializer.getText(sf));
          if (m)
            map.set(
              `${homepageCopy}:HOMEPAGE_COPY.${m[1]}`,
              `marketing-page/home#${section}.${slot.name.getText(sf)}`
            );
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return map;
}

export function buildInventory(registry = { ids: {} }) {
  const recordMap = recordSlots();
  const ids = { ...registry.ids }; // key -> ID
  const counters = {};
  for (const id of Object.values(ids)) {
    const [, p, n] = /^(.+)-(\d+)$/.exec(id) ?? [];
    if (p) counters[p] = Math.max(counters[p] ?? 0, Number(n));
  }
  const assign = (prefix, key) => {
    if (!ids[key])
      ids[key] =
        `${prefix}-${(counters[prefix] = (counters[prefix] ?? 0) + 1)}`;
    return ids[key];
  };

  const claimed = new Set();
  const rows = [];
  // Which routes reach each file, so a line owned by one route still shows
  // up under every other route that renders it.
  const reach = new Map();
  for (const { route, entry } of ROUTES) {
    for (const f of closure([entry]))
      reach.set(f, [...(reach.get(f) ?? []), route]);
  }
  const emitGroup = (groupFiles, route, prefix) => {
    const dupes = new Map();
    for (const f of groupFiles) {
      claimed.add(f);
      for (const r of extractFile(f, recordMap)) {
        const base = r.record ? `record:${r.record}` : `${r.file}#${r.text}`;
        const n = (dupes.get(base) ?? 0) + 1;
        dupes.set(base, n);
        const key = n === 1 ? base : `${base}#${n}`;
        const { path: _p, record } = r;
        const also = (reach.get(f) ?? []).filter(x => x !== route);
        rows.push({
          id: assign(prefix, key),
          route,
          section: r.section,
          role: r.role,
          text: r.text,
          source: record ? `record:${record}` : `${r.file}:${r.line}`,
          ...(record ? { defaultAt: `${r.file}:${r.line}` } : {}),
          ...(also.length ? { alsoOn: also } : {}),
        });
      }
    }
  };

  const chrome = closure(SITE_CHROME.entries);
  emitGroup(chrome, SITE_CHROME.route, SITE_CHROME.prefix);
  const chromeSet = new Set(chrome);
  for (const { route, prefix, entry } of ROUTES) {
    const files = closure([entry], new Set([...chromeSet, ...claimed]));
    emitGroup(files, route, prefix);
  }
  // Traffic order: routes in ROUTES order (chrome last), position in file order.
  /** @type {Map<string, number>} */
  const rank = new Map([
    ...ROUTES.map(/** @returns {[string, number]} */ (r, i) => [r.route, i]),
    [SITE_CHROME.route, ROUTES.length],
  ]);
  rows.sort((a, b) => rank.get(a.route) - rank.get(b.route));
  return { rows, registry: { ids } };
}

// Compact on purpose: one entry per line keeps diffs reviewable and the
// tracked-bytes budget (repo-hygiene) intact.
function stable(obj) {
  const lines = Object.entries(obj).map(([k, v]) => {
    if (Array.isArray(v))
      return ` ${JSON.stringify(k)}: [\n${v.map(x => `  ${JSON.stringify(x)}`).join(',\n')}\n ]`;
    if (v && typeof v === 'object')
      return ` ${JSON.stringify(k)}: {\n${Object.entries(v)
        .map(([a, b]) => `  ${JSON.stringify(a)}: ${JSON.stringify(b)}`)
        .join(',\n')}\n }`;
    return ` ${JSON.stringify(k)}: ${JSON.stringify(v)}`;
  });
  return `{\n${lines.join(',\n')}\n}\n`;
}

function main() {
  const check = process.argv.includes('--check');
  const registry = existsSync(IDS_PATH)
    ? JSON.parse(read(IDS_PATH))
    : { ids: {} };
  const { rows, registry: next } = buildInventory(registry);
  const sortedIds = Object.fromEntries(
    Object.entries(next.ids).sort(([a], [b]) => a.localeCompare(b))
  );
  const idsOut = stable({ ids: sortedIds });
  const outJson = stable({ schema: 1, count: rows.length, rows });
  if (check) {
    const stale =
      // inventory.gen.json is untracked (repo byte budget); verify only if present.
      (existsSync(OUT_PATH) &&
        !isDeepStrictEqual(JSON.parse(read(OUT_PATH)), JSON.parse(outJson))) ||
      !isDeepStrictEqual(JSON.parse(read(IDS_PATH)), JSON.parse(idsOut));
    if (stale) {
      console.error(
        'copy inventory is stale: run node scripts/copy-inventory/extract.mjs'
      );
      process.exit(1);
    }
    return;
  }
  writeFileSync(IDS_PATH, idsOut);
  writeFileSync(OUT_PATH, outJson);
  const per = {};
  for (const r of rows) per[r.route] = (per[r.route] ?? 0) + 1;
  console.log(JSON.stringify({ total: rows.length, perRoute: per }, null, 1));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
