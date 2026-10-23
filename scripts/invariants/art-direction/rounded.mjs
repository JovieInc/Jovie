/** Marketing images and cards use a radius token. See MKT-D16. */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const ROUNDED_BASELINE =
  'scripts/invariants/art-direction/rounded.baseline.json';
export const FRAME_CLASS = 'marketing-rounded-frame';
const ROOTS = [
  'apps/web/app/(marketing)',
  'apps/web/app/(home)',
  'apps/web/components/marketing',
  'apps/web/components/homepage',
  'apps/web/components/features/home',
  'apps/web/components/features/pricing',
  'apps/web/components/features/visibility-audit',
];
const EXTRAS = [
  ...'AboutPageContent AboutPageRefresh BlogAuthorPage BlogCategoryContent BlogPostPage ComparisonPageContent PricingRecipeBody SupportPageContent VoicePageContent'
    .split(' ')
    .map(name => `apps/web/components/organisms/${name}.tsx`),
  'apps/web/components/site/MarketingFooterCta.tsx',
];
const SKIP_DIR = new Set(
  'node_modules,.next,dist,coverage,storybook-static'.split(',')
);
const SKIP_FILE = /\.(?:test|spec|stories)\.[cm]?[jt]sx?$/;
const HTML = new Set(
  'a,article,aside,button,div,figcaption,figure,footer,header,img,li,main,nav,ol,p,picture,section,span,ul,video,h1,h2,h3,h4,source'.split(
    ','
  )
);
const FULL_BLEED =
  /^(?:homepage-editorial-hero(?:__backdrop|__light-well)?|marketing-editorial-hero-photo(?:__img)?|marketing-hero-photo(?:__img)?|marketing-hero-dock|marketing-route-hero__media)$/;
const CLIPPING = new Set([
  'ArtistProfilePhoneFrame',
  'HomePhoneFrame',
  'MobileWebScreen',
  'MarketingRoundedFrame',
]);
const ROUNDED_UTILITY =
  /^(?:[\w-]+:)*rounded(?:-(?:t|b|l|r|tl|tr|bl|br|s|e|x|y|ss|se|es|ee))?(?:-(?:sm|md|lg|xl|2xl|3xl|4xl|full))?$/;
const TOKEN_RADIUS = /var\(\s*--[\w-]*radius[\w-]*\s*(?:\)|,)/;
const RANK = { none: 0, zero: 1, inherit: 2, raw: 3, token: 4 };
export function isCardClass(token) {
  if (/^(?:shadow|bg|text|border|ring|fill|stroke|from|via|to)-/.test(token)) {
    return false;
  }
  return /(?:^|-)card$/.test(token) || /__card(?:--[a-z0-9-]+)?$/.test(token);
}
export function classifyRadiusValue(value) {
  if (!value?.trim()) return 'none';
  const body = value.replace(/!important/g, '').trim();
  if (/^(?:inherit|unset|initial)$/.test(body)) return 'inherit';
  if (TOKEN_RADIUS.test(body)) {
    return /^var\(\s*--radius-none\s*\)$/.test(body) ? 'zero' : 'token';
  }
  const numeric = body
    .split(/[\s/]+/)
    .filter(part => /^-?\d*\.?\d+(?:px|rem|em|%)?$/.test(part));
  if (
    numeric.length > 0 &&
    numeric.every(part => /^(?:0|0px|0rem|0em|0%)$/.test(part))
  ) {
    return 'zero';
  }
  return /\d/.test(body) ? 'raw' : 'none';
}
export function isRoundedClass(token) {
  if (!token || token.includes('none')) return false;
  if (token === FRAME_CLASS) return true;
  if (token.startsWith('rounded-[')) return TOKEN_RADIUS.test(token);
  return ROUNDED_UTILITY.test(token);
}
function mergeRadius(previous, incoming) {
  if (!incoming) return previous;
  if (!previous) return incoming;
  const prevKind = classifyRadiusValue(previous);
  const nextKind = classifyRadiusValue(incoming);
  const harsh = kind => kind === 'zero' || kind === 'raw';
  if (harsh(nextKind) && !harsh(prevKind)) return incoming;
  if (harsh(prevKind) && !harsh(nextKind)) return previous;
  return RANK[nextKind] >= RANK[prevKind] ? incoming : previous;
}
export function isRawArbitraryRadius(token) {
  return (
    token.startsWith('rounded-[') &&
    !/inherit|unset|initial/.test(token) &&
    !isRoundedClass(token)
  );
}
function stronger(left, right) {
  return RANK[right] > RANK[left] ? right : left;
}
export function radiusKind(classes, cssIndex) {
  let kind = 'none';
  let rawArbitrary = false;
  for (const token of classes) {
    if (isRawArbitraryRadius(token)) rawArbitrary = true;
    else if (isRoundedClass(token)) kind = stronger(kind, 'token');
    else {
      const info = cssIndex.get(token);
      if (info) kind = stronger(kind, classifyRadiusValue(info.radius));
    }
  }
  return rawArbitrary ? 'raw' : kind;
}
function pushTokens(text, tokens) {
  for (const token of text.split(/\s+/)) {
    if (token && /^[A-Za-z][\w:/.[\]-]*$/.test(token)) tokens.push(token);
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
    for (const span of node.templateSpans)
      pushTokens(span.literal.text, tokens);
    return;
  }
  ts.forEachChild(node, child => walkStrings(child, tokens));
}
function classTokens(open) {
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
function tagName(tag) {
  const text = tag.getText();
  return text.includes('.') ? text.slice(text.lastIndexOf('.') + 1) : text;
}
export function parseElements(source) {
  const file = ts.createSourceFile(
    'rounded.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const elements = [];
  const stack = [];
  const visit = node => {
    const element = ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node);
    if (!element) {
      ts.forEachChild(node, visit);
      return;
    }
    const open = ts.isJsxElement(node) ? node.openingElement : node;
    const name = tagName(open.tagName);
    const keep = /^[A-Z]/.test(name) || HTML.has(name);
    const classes = keep ? classTokens(open) : [];
    if (keep) {
      elements.push({
        name,
        raw: source.slice(open.getStart(file), open.end),
        classes,
        line: file.getLineAndCharacterOfPosition(open.getStart(file)).line + 1,
        ancestors: stack.map(entry => ({
          name: entry.name,
          classes: entry.classes,
        })),
      });
    }
    if (!ts.isJsxElement(node)) return;
    if (keep) stack.push({ name, classes });
    for (const child of node.children) visit(child);
    if (keep) stack.pop();
  };
  visit(file);
  return elements;
}
function blankInfo() {
  return { radius: '', surface: false, photo: false, photoFile: '' };
}
function walkCss(css, index) {
  let cursor = 0;
  while (cursor < css.length) {
    const open = css.indexOf('{', cursor);
    if (open < 0) break;
    const selector = css.slice(cursor, open).trim();
    let depth = 1;
    let end = open + 1;
    while (end < css.length && depth > 0) {
      if (css[end] === '{') depth += 1;
      else if (css[end] === '}') depth -= 1;
      end += 1;
    }
    const body = css.slice(open + 1, end - 1);
    cursor = end;
    if (/^@(?:media|supports|layer)\b/.test(selector)) {
      walkCss(body, index);
      continue;
    }
    if (selector.startsWith('@')) continue;
    const radius =
      /(?:^|;)\s*border-radius\s*:\s*([^;]+)/.exec(body)?.[1]?.trim() ?? '';
    const surface =
      /(?:^|;)\s*(?:background(?:-color|-image)?|border(?:-color|-width|-style)?|box-shadow)\s*:/.test(
        body
      );
    const photo =
      /background-image\s*:\s*url\(/.test(body) &&
      !/background-image\s*:\s*url\(\s*['"]?data:/.test(body);
    if (!radius && !surface && !photo) continue;
    for (const part of selector.split(',')) {
      const compound = part.trim().split(/\s+/).pop() ?? '';
      for (const token of compound.split('.')) {
        const name = token.split(/[:[]/)[0];
        if (!name || /^[:#@]/.test(name)) continue;
        const previous = index.get(name) ?? blankInfo();
        index.set(name, {
          radius: mergeRadius(previous.radius, radius),
          surface: previous.surface || surface,
          photo: previous.photo || photo,
          photoFile: previous.photoFile,
        });
      }
    }
  }
}
export function indexCss(css) {
  const clean = css
    .replace(/\/\*[\s\S]*?\*\//g, block => block.replace(/[^\n]/g, ' '))
    .replace(/@keyframes[\s\S]*?\{[\s\S]*?\n\}/g, block =>
      block.replace(/[^\n]/g, ' ')
    );
  const index = new Map();
  walkCss(clean, index);
  return index;
}
function attr(raw, name) {
  return (
    new RegExp(`${name}\\s*=\\s*['"\`]([^'"\`]*)['"\`]`).exec(raw)?.[1] ?? ''
  );
}
export function exemptionFor(node) {
  const own = node.classes.join(' ');
  const ancestorClasses = (node.ancestors ?? [])
    .flatMap(entry => entry.classes)
    .join(' ');
  const blob = `${node.file ?? ''} ${node.name} ${node.raw} ${own} ${ancestorClasses}`;
  if (
    FULL_BLEED.test(node.name) ||
    node.classes.some(token => FULL_BLEED.test(token)) ||
    (node.ancestors ?? []).some(entry =>
      entry.classes.some(token => FULL_BLEED.test(token))
    )
  ) {
    return 'full-bleed-hero';
  }
  if (
    node.name === 'svg' ||
    /(?:Icon|Logo|Mark)$/.test(node.name) ||
    node.classes.includes('official-iphone-frame__bezel') ||
    /(?:^|\/)(?:logo|logos|icons|brand)(?:\/|$)|label-logos|LogoBar|logo-strip|platform-logo/i.test(
      blob
    ) ||
    /(?:^|\s)(?:[\w-]*logo[\w-]*|icon|wordmark|logomark)(?:\s|$)/i.test(
      `${own} ${ancestorClasses}`
    ) ||
    /\b(?:logo|icon|wordmark)\b/i.test(attr(node.raw, 'alt'))
  ) {
    return 'logo-icon-svg';
  }
  const round =
    node.classes.includes('rounded-full') ||
    (node.ancestors ?? []).some(entry =>
      entry.classes.includes('rounded-full')
    ) ||
    /border-radius\s*:\s*(?:50%|100%|9999px|var\(\s*--radius-(?:full|pill))/.test(
      blob
    );
  return /\bavatar\b/i.test(blob) && round ? 'round-avatar' : null;
}
export function isCard(node, cssIndex = new Map()) {
  if (!HTML.has(node.name)) return false;
  return node.classes.some(token => {
    if (!isCardClass(token)) return false;
    if (!/__card--/.test(token)) return true;
    const info = cssIndex.get(token);
    return Boolean(
      info?.surface || classifyRadiusValue(info?.radius) !== 'none'
    );
  });
}
export function judge(node, cssIndex = new Map()) {
  const image = node.name === 'img' || node.name === 'Image';
  const video = node.name === 'video';
  const card = isCard(node, cssIndex);
  const rawArbitrary = node.classes.some(token => isRawArbitraryRadius(token));
  if (!image && !video && !card && !rawArbitrary) return { status: 'pass' };
  const exemption = exemptionFor(node);
  if (exemption) return { status: 'exempt', reason: exemption };
  const style = /borderRadius\s*:\s*['"]([^'"]+)['"]/.exec(node.raw)?.[1];
  const self = stronger(
    radiusKind(node.classes, cssIndex),
    style ? classifyRadiusValue(style) : 'none'
  );
  let ancestor = 'none';
  for (const entry of node.ancestors ?? []) {
    ancestor = stronger(ancestor, radiusKind(entry.classes, cssIndex));
    if ((image || video) && CLIPPING.has(entry.name)) ancestor = 'token';
  }
  const kind = image ? 'image' : video ? 'video' : 'card';
  const radius = self === 'raw' || ancestor === 'raw' ? 'raw' : 'square';
  if (image || video) {
    return self === 'token' || ancestor === 'token'
      ? { status: 'pass', kind }
      : { status: 'violation', kind, radius };
  }
  return self === 'token' || (self === 'inherit' && ancestor === 'token')
    ? { status: 'pass', kind }
    : { status: 'violation', kind, radius: self === 'raw' ? 'raw' : 'square' };
}
export function scanSources(files) {
  const cssIndex = new Map();
  for (const file of files) {
    if (!file.path.endsWith('.css')) continue;
    for (const [name, info] of indexCss(file.source)) {
      const previous = cssIndex.get(name) ?? blankInfo();
      cssIndex.set(name, {
        radius: mergeRadius(previous.radius, info.radius),
        surface: previous.surface || info.surface,
        photo: previous.photo || info.photo,
        photoFile: info.photo ? file.path : previous.photoFile,
      });
    }
  }
  const ids = [];
  const exemptions = [];
  for (const file of files) {
    if (!/\.(?:tsx|jsx)$/.test(file.path)) continue;
    for (const node of parseElements(file.source)) {
      const judged = judge({ ...node, file: file.path }, cssIndex);
      if (judged.status === 'exempt' && judged.reason) {
        exemptions.push(judged.reason);
      }
      if (judged.status === 'violation') {
        ids.push(
          `${judged.radius}:${file.path}:${node.line ?? 0}:${judged.kind}:${node.classes[0] || node.name}`
        );
      }
    }
  }
  for (const [name, info] of cssIndex) {
    if (!info.photo || FULL_BLEED.test(name)) continue;
    if (/logo|icon|avatar|grain|noise|bezel/i.test(name)) continue;
    if (classifyRadiusValue(info.radius) === 'token') continue;
    ids.push(`square:${info.photoFile}:0:image:${name}`);
  }
  ids.sort();
  return { ids, exemptions, cssIndex };
}
export function listMarketingSources(repoRoot, roots = ROOTS, extras = EXTRAS) {
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
  for (const root of roots) visit(join(repoRoot, root));
  for (const extra of extras) {
    const absolute = join(repoRoot, extra);
    if (existsSync(absolute)) files.push(absolute);
  }
  return [...new Set(files)]
    .filter(file => {
      const rel = relative(repoRoot, file).split('\\').join('/');
      return !SKIP_FILE.test(rel) && /\.(?:tsx|jsx|css)$/.test(rel);
    })
    .sort();
}
export function scanMarketing(repoRoot = REPO_ROOT) {
  return scanSources(
    listMarketingSources(repoRoot).map(absolute => ({
      path: relative(repoRoot, absolute).split('\\').join('/'),
      source: readFileSync(absolute, 'utf8'),
    }))
  );
}
function list(mark, rows) {
  return rows.map(id => `  ${mark} ${id}`).join('\n');
}
export function evaluateRatchet({
  current,
  recorded,
  ancestor,
  recordedCount,
}) {
  const errors = [];
  const known = new Set(recorded);
  const added = current.filter(id => !known.has(id));
  const removed = recorded.filter(id => !current.includes(id));
  if (added.length > 0) {
    errors.push(
      `baseline is missing ${added.length} live id(s); do not add ids:\n${list('+', added)}`
    );
  }
  if (removed.length > 0) {
    errors.push(
      `baseline can only shrink; delete ${removed.length} resolved id(s):\n${list('-', removed)}`
    );
  }
  if (recordedCount !== undefined && recordedCount !== recorded.length) {
    errors.push(
      `baseline count ${recordedCount} must equal the id list (${recorded.length})`
    );
  }
  if (ancestor) {
    const knownAncestor = new Set(ancestor);
    const grown = current.filter(id => !knownAncestor.has(id));
    if (grown.length > 0) {
      errors.push(
        `new violations are not allowed (${grown.length}):\n${list('+', grown)}`
      );
    }
    if (current.length > ancestor.length) {
      errors.push(
        `baseline count can only go down (${ancestor.length} -> ${current.length})`
      );
    }
  }
  return errors;
}
export function ancestorIds(repoRoot, relPath) {
  const git = (args, encoding) =>
    spawnSync('git', args, { cwd: repoRoot, encoding });
  if (git(['rev-parse', '--verify', 'origin/main']).status !== 0) {
    return {
      ok: false,
      error:
        'origin/main is not available; the ratchet cannot prove it only shrinks',
    };
  }
  const spec = `origin/main:${relPath}`;
  if (git(['cat-file', '-e', spec]).status !== 0) {
    return { ok: true, ancestor: null };
  }
  const show = git(['show', spec], 'utf8');
  return show.status === 0
    ? { ok: true, ancestor: JSON.parse(show.stdout).ids ?? [] }
    : { ok: false, error: `unable to read ${spec}` };
}
export async function checkRounded(repoRoot = REPO_ROOT) {
  const { ids } = scanMarketing(repoRoot);
  const recordedFile = JSON.parse(
    readFileSync(join(repoRoot, ROUNDED_BASELINE), 'utf8')
  );
  const ancestor = ancestorIds(repoRoot, ROUNDED_BASELINE);
  const failures = ancestor.ok
    ? evaluateRatchet({
        current: ids,
        recorded: recordedFile.ids ?? [],
        ancestor: ancestor.ancestor,
        recordedCount: recordedFile.count,
      })
    : [ancestor.error ?? 'ancestor unreadable'];
  return { failures, ids, count: ids.length };
}
export const check = checkRounded;
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { failures, ids, count } = await checkRounded();
  process.stdout.write(`marketing-rounded: ${count} live id(s)\n`);
  if (process.argv.includes('--print')) {
    for (const id of ids) process.stdout.write(`${id}\n`);
  }
  if (failures.length > 0) {
    process.stderr.write(`${failures.join('\n')}\n`);
    process.exitCode = 1;
  }
}
