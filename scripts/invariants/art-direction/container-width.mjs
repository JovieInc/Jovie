/**
 * Marketing and public pages have ONE boxed content width and ONE full-bleed
 * override. Mixed container widths and gutters are why pages stop looking
 * designed. See MKT-D18 in docs/marketing/DESIGN_INVARIANTS.md.
 *
 * The box is `.public-container` (`--ds-public-content-max` plus the
 * `--ds-public-gutter` steps), reached through `MarketingContainer` or
 * `Container`. The override is `.public-container--bleed` (or `bleed`).
 *
 * A reading measure (a cap at or below 48rem, or in ch) is typography inside
 * the box, not a container. Anything wider that is not the token fails. A
 * container with its own horizontal padding fails, because the gutter is part
 * of the token. A hit that is not already on origin/main fails, so the set
 * only shrinks. There is no exception file.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const ANCESTOR_REF = 'origin/main';
export const MEASURE_LIMIT_REM = 48;
export const GUIDANCE =
  'Use MarketingContainer or Container (the single .public-container width). The only override is bleed. Do not set a page max-width or container padding yourself.';

const ROOTS = [
  'apps/web/app/(marketing)',
  'apps/web/app/(home)',
  'apps/web/components/marketing',
  'apps/web/components/homepage',
  'apps/web/components/features/home',
  'apps/web/components/features/pay',
  'apps/web/components/features/pricing',
  'apps/web/components/features/visibility-audit',
  'apps/web/components/site',
];
const EXTRAS = [
  'apps/web/components/organisms/HeaderNav.tsx',
  'apps/web/components/organisms/HeaderNav.css',
  ...'AboutPageContent AboutPageRefresh BlogAuthorPage BlogCategoryContent BlogPostPage ComparisonPageContent PricingRecipeBody SupportPageContent VoicePageContent'
    .split(' ')
    .map(name => `apps/web/components/organisms/${name}.tsx`),
];
const SKIP_DIR = new Set(
  'node_modules,.next,dist,coverage,storybook-static'.split(',')
);
const SKIP_FILE = /\.(?:test|spec|stories)\.[cm]?[jt]sx?$/;
/** The primitives own the token. They are the only place it may be spelled. */
const PRIMITIVES = new Set([
  'apps/web/components/marketing/MarketingContainer.tsx',
  'apps/web/components/site/Container.tsx',
]);
/** A reasoned opt-out on the line or the line above. Not a container. */
const ALLOW = /container-width-allow:\s*\S+/;
const BOX_TAGS = new Set(['MarketingContainer', 'Container']);
const REM = {
  xs: 20,
  sm: 24,
  md: 28,
  lg: 32,
  xl: 36,
  '2xl': 42,
  '3xl': 48,
  '4xl': 56,
  '5xl': 64,
  '6xl': 72,
  '7xl': 80,
};
const WIDTH_VAR = /(?:section|grid|content|page|container|shell)-max/;
const CANONICAL_GUTTER = new Set(['px-6', 'sm:px-8', 'lg:px-10']);
const PADDING_X = /^(?:[a-z0-9-]+:)*(?:px|pl|pr|ps|pe)-/;

/** Length in rem, or null when the value is not a plain length. */
export function toRem(value) {
  const match = /^(-?\d*\.?\d+)(rem|em|px)$/.exec(value.trim());
  if (!match) return null;
  const n = Number(match[1]);
  return match[2] === 'px' ? n / 16 : n;
}

/** Why a max-w-* utility is a rogue page width, or null when it is fine. */
export function maxWidthProblem(utility) {
  const name = utility.replace(/^(?:[a-z0-9-]+:)*max-w-/, '');
  if (['public-content', 'prose-canonical', 'none', 'full'].includes(name)) {
    return null;
  }
  if (name.startsWith('screen')) return 'viewport-width';
  if (name.startsWith('linear-')) return 'second-token';
  if (name.startsWith('[')) {
    const body = name.slice(1, -1);
    if (/--ds-public-content-max/.test(body)) return null;
    if (/var\(/.test(body)) return WIDTH_VAR.test(body) ? 'second-token' : null;
    const lengths = [...body.matchAll(/(\d*\.?\d+)(rem|em|px)\b/g)].map(m =>
      toRem(m[0])
    );
    return lengths.some(rem => rem > MEASURE_LIMIT_REM) ? 'page-width' : null;
  }
  if (name in REM) return REM[name] > MEASURE_LIMIT_REM ? 'page-width' : null;
  if (/^\d+(?:\.\d+)?$/.test(name)) {
    return Number(name) * 0.25 > MEASURE_LIMIT_REM ? 'page-width' : null;
  }
  return null;
}

function pushTokens(text, tokens) {
  for (const token of text.split(/\s+/)) {
    if (token && /^[A-Za-z][\w:/.,[\]()-]*$/.test(token)) tokens.push(token);
  }
}
function walkStrings(node, tokens) {
  if (!node) return;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    pushTokens(node.text, tokens);
    return;
  }
  if (ts.isTemplateExpression(node)) {
    pushTokens(node.head.text, tokens);
    for (const span of node.templateSpans) {
      pushTokens(span.literal.text, tokens);
    }
    return;
  }
  ts.forEachChild(node, child => walkStrings(child, tokens));
}
function classTokensOf(open) {
  const tokens = [];
  for (const attr of open.attributes.properties) {
    if (!ts.isJsxAttribute(attr) || attr.name.getText() !== 'className') {
      continue;
    }
    const init = attr.initializer;
    if (!init) continue;
    walkStrings(ts.isJsxExpression(init) ? init.expression : init, tokens);
  }
  return tokens;
}

function gutterProblem(tokens, tag) {
  const padding = tokens.filter(token => PADDING_X.test(token));
  if (padding.length === 0) return null;
  const boxed =
    BOX_TAGS.has(tag) ||
    tokens.includes('public-container') ||
    tokens.includes('max-w-public-content');
  if (!boxed) return null;
  if (padding.length === 1 && padding[0] === 'px-(--ds-public-gutter)') {
    return null;
  }
  if (
    padding.length === CANONICAL_GUTTER.size &&
    padding.every(token => CANONICAL_GUTTER.has(token)) &&
    !tokens.includes('public-container') &&
    !BOX_TAGS.has(tag)
  ) {
    return null;
  }
  return padding.sort().join(' ');
}

const isWidthToken = token => token === 'container' || /max-w-/.test(token);

function scanTsx(path, source) {
  const found = [];
  const kind = path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    kind
  );
  const flagTokens = (tokens, tag, pos) => {
    for (const token of tokens) {
      if (token === 'container') {
        found.push(['container-class', 'container', pos]);
      } else if (/(?:^|:)max-w-/.test(token)) {
        const problem = maxWidthProblem(token);
        if (problem) {
          found.push([problem, token.replace(/^[a-z0-9-]+:/, ''), pos]);
        }
      }
    }
    const gutter = tag && gutterProblem(tokens, tag);
    if (gutter) found.push(['gutter', gutter, pos]);
  };
  const visit = node => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      flagTokens(classTokensOf(node), node.tagName.getText(), node.getStart());
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  // Class strings held in constants (cn(...), variant maps) are real classes
  // too. Gutter pairing needs the element, so only widths apply here.
  const outsideJsx = node => {
    if (ts.isJsxAttribute(node) && node.name.getText() === 'className') return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const tokens = [];
      pushTokens(node.text, tokens);
      flagTokens(tokens.filter(isWidthToken), null, node.getStart());
      return;
    }
    if (ts.isTemplateExpression(node)) {
      const tokens = [];
      pushTokens(node.head.text, tokens);
      for (const span of node.templateSpans) {
        pushTokens(span.literal.text, tokens);
      }
      flagTokens(tokens.filter(isWidthToken), null, node.getStart());
      return;
    }
    ts.forEachChild(node, outsideJsx);
  };
  outsideJsx(sf);
  return found;
}

function scanCss(path, source) {
  const found = [];
  const text = source.replace(/\/\*[\s\S]*?\*\//g, block =>
    block.replace(/[^\n]/g, ' ')
  );
  const decl =
    /(?:^|[;{])\s*(max-width|width|--[\w-]+)\s*:\s*([^;{}]+?)\s*(?:;|(?=\}))/gm;
  let match = decl.exec(text);
  while (match) {
    const [whole, prop, value] = match;
    // Point at the property itself, not the `;` or `{` before it, so a
    // container-width-allow comment on the line above the declaration counts.
    const at = match.index + (whole.match(/^[;{]?\s*/)?.[0].length ?? 0);
    const lengths = [...value.matchAll(/(\d*\.?\d+)(rem|em|px)\b/g)].map(m =>
      toRem(m[0])
    );
    const wide = lengths.some(rem => rem > MEASURE_LIMIT_REM);
    const token = value.replace(/\s+/g, ' ');
    if (prop.startsWith('--')) {
      if (WIDTH_VAR.test(prop) && !/--ds-public-content-max/.test(value)) {
        found.push(['second-token', `${prop}: ${token}`, at]);
      }
    } else if (/--ds-public-content-max/.test(value)) {
      // The token itself. Fine.
    } else if (
      /var\(\s*--[\w-]*(?:section|grid|content|page|container)-max/.test(value)
    ) {
      found.push(['second-token', `${prop}: ${token}`, at]);
    } else if (wide) {
      found.push(['page-width', `${prop}: ${token}`, at]);
    }
    match = decl.exec(text);
  }
  return found;
}

/**
 * @param {readonly { path: string, source: string }[]} entries
 */
export function scanSources(entries) {
  const ids = [];
  for (const { path, source } of entries) {
    if (PRIMITIVES.has(path)) continue;
    const found = path.endsWith('.css')
      ? scanCss(path, source)
      : scanTsx(path, source);
    const seen = new Map();
    const lines = source.split('\n');
    for (const [rule, token, pos] of found) {
      const line = source.slice(0, pos).split('\n').length - 1;
      const marked = [lines[line - 1], lines[line]].some(text =>
        ALLOW.test(text ?? '')
      );
      if (marked) continue;
      const base = `${path}|${rule}|${token}`;
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      ids.push(count === 1 ? base : `${base}#${count}`);
    }
  }
  ids.sort();
  return { ids };
}

export function listContainerSources(repoRoot = REPO_ROOT) {
  const files = [];
  const visit = absolute => {
    let stats;
    try {
      stats = statSync(absolute);
    } catch {
      return;
    }
    if (stats.isFile()) {
      files.push(absolute);
      return;
    }
    if (!stats.isDirectory()) return;
    for (const entry of readdirSync(absolute)) {
      if (entry.startsWith('.') || SKIP_DIR.has(entry)) continue;
      visit(join(absolute, entry));
    }
  };
  for (const root of ROOTS) visit(join(repoRoot, root));
  for (const extra of EXTRAS) {
    const absolute = join(repoRoot, extra);
    if (existsSync(absolute)) files.push(absolute);
  }
  return [...new Set(files)]
    .filter(file => isContainerSource(relative(repoRoot, file)))
    .sort();
}

/** Repo-relative path the container-width scan owns. */
export function isContainerSource(relPath) {
  const path = relPath.split('\\').join('/');
  if (SKIP_FILE.test(path) || !/\.(?:tsx|ts|css)$/.test(path)) return false;
  return (
    EXTRAS.includes(path) || ROOTS.some(root => path.startsWith(`${root}/`))
  );
}

function gitText(repoRoot, args) {
  return spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

/**
 * Blob bytes for `ref:path` specs, in order. One missing object fails closed.
 * @returns {{ ok: true, sources: string[] } | { ok: false, error: string }}
 */
function readRefBlobs(repoRoot, ref, paths) {
  if (paths.length === 0) return { ok: true, sources: [] };
  const result = spawnSync('git', ['cat-file', '--batch'], {
    cwd: repoRoot,
    input: `${paths.map(path => `${ref}:${path}`).join('\n')}\n`,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return {
      ok: false,
      error: `${ref} is not available; the ratchet cannot prove it only shrinks`,
    };
  }
  const buf = result.stdout;
  const sources = [];
  let offset = 0;
  for (const path of paths) {
    const headerEnd = buf.indexOf(0x0a, offset);
    if (headerEnd < 0)
      return { ok: false, error: `unable to read ${ref}:${path}` };
    const header = buf.subarray(offset, headerEnd).toString('utf8');
    if (header.endsWith(' missing')) {
      return { ok: false, error: `unable to read ${ref}:${path}` };
    }
    const size = Number(header.split(' ').at(-1));
    if (!Number.isInteger(size) || size < 0) {
      return { ok: false, error: `unable to read ${ref}:${path}` };
    }
    const start = headerEnd + 1;
    const end = start + size;
    if (end > buf.length)
      return { ok: false, error: `unable to read ${ref}:${path}` };
    sources.push(buf.subarray(start, end).toString('utf8'));
    offset = end + 1;
  }
  return { ok: true, sources };
}

/**
 * Ids already on the ancestor ref. A missing ref fails closed.
 * @returns {{ ok: true, ids: string[] } | { ok: false, error: string }}
 */
export function ancestorContainerIds(repoRoot = REPO_ROOT, ref = ANCESTOR_REF) {
  const listed = gitText(repoRoot, ['ls-tree', '-r', '--name-only', ref]);
  if (listed.status !== 0) {
    return {
      ok: false,
      error: `${ref} is not available; the ratchet cannot prove it only shrinks`,
    };
  }
  const paths = listed.stdout.split('\n').filter(isContainerSource);
  const blobs = readRefBlobs(repoRoot, ref, paths);
  if (blobs.ok === false) return blobs;
  return {
    ok: true,
    ids: scanSources(
      paths.map((path, index) => ({ path, source: blobs.sources[index] }))
    ).ids,
  };
}

/** Live ids the ancestor does not already contain. Shrinking is allowed. */
export function idsBeyondAncestor(current, ancestor) {
  const known = new Set(ancestor);
  return current.filter(id => !known.has(id));
}

export function scanContainerWidth(repoRoot = REPO_ROOT) {
  return scanSources(
    listContainerSources(repoRoot).map(absolute => ({
      path: relative(repoRoot, absolute).split('\\').join('/'),
      source: readFileSync(absolute, 'utf8'),
    }))
  );
}

export function checkContainerWidth(repoRoot = REPO_ROOT, options = {}) {
  const { ids } = scanContainerWidth(repoRoot);
  /** @type {ReturnType<typeof ancestorContainerIds>} */
  const ancestor =
    options.ancestorIds != null
      ? { ok: true, ids: options.ancestorIds }
      : ancestorContainerIds(repoRoot, options.ref ?? ANCESTOR_REF);
  const failures = [];
  if (ancestor.ok === false) failures.push(ancestor.error);
  else {
    const grown = idsBeyondAncestor(ids, ancestor.ids);
    if (grown.length > 0) {
      failures.push(
        `marketing pages use one boxed width and one full-bleed override. ${GUIDANCE}`,
        `new violations are not allowed (${grown.length}):\n${grown
          .map(id => `  + ${id}`)
          .join('\n')}`
      );
    }
  }
  return { failures, ids, count: ids.length };
}

export const check = checkContainerWidth;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { failures, ids, count } = checkContainerWidth();
  process.stdout.write(`marketing-container-width: ${count} live id(s)\n`);
  if (process.argv.includes('--print')) {
    for (const id of ids) process.stdout.write(`${id}\n`);
  }
  if (failures.length > 0) {
    process.stderr.write(`${failures.join('\n')}\n`);
    process.exitCode = 1;
  }
}
