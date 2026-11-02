#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
// Deterministic source guard: no model, network, feature flag, or diff-only gaps.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const POLICY = 'scripts/invariants/copy-leak/';
export const config = JSON.parse(
  readFileSync(new URL('config.json', import.meta.url), 'utf8')
);
if (
  [
    ...config.exclude,
    ...config.nonCopyValues,
    ...config.formats,
    ...config.allow,
    ...config.syntaxExclusions,
  ].some(e => !e.reason?.trim())
)
  throw new Error('Every copy-leak exception needs a reason');
const ts = createRequire(join(process.cwd(), 'package.json'))('typescript');
const patterns = config.patterns.map(p => ({
  ...p,
  regex: new RegExp(p.source, 'imu'),
}));
const nonCopyAttributes = new RegExp(config.nonCopyAttributes, 'u');
const nonCopyBindings = new RegExp(config.nonCopyBindings, 'iu');
const headline =
  /(?:headline|heading|title|subhead|subtitle|^sub$|cta|action|button|label)/iu;

function htmlRows(rows) {
  return rows.flatMap(row => [
    row,
    ...[
      ...row.text.matchAll(/<(h[1-3]|title|desc|text)\b[^>]*>([^]*?)<\/\1>/giu),
    ].map(m => ({
      text: m[2],
      line: row.line,
      context: /^(?:h[1-3]|title)$/u.test(m[1]) ? 'heading' : '',
    })),
    ...[
      ...row.text.matchAll(
        /\b(alt|aria-label|aria-description|placeholder|title|content)\s*=\s*(['"])([^]*?)\2/giu
      ),
    ].map(m => ({ text: m[3], line: row.line, context: m[1] })),
  ]);
}

function fold(node) {
  if (ts.isJsxElement(node)) return node.children.map(fold).join('');
  if (ts.isJsxExpression(node))
    return node.expression ? fold(node.expression) : '';
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  )
    return fold(node.left) + fold(node.right);
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isJsxText(node)
  )
    return node.text;
  if (ts.isTemplateExpression(node))
    return (
      node.head.text +
      node.templateSpans.map(s => fold(s.expression) + s.literal.text).join('')
    );
  return '\uE000dynamic\uE001';
}

function contextFor(node, tree) {
  const names = [];
  for (let a = node.parent; a; a = a.parent) {
    if (
      (ts.isPropertyAssignment(a) ||
        ts.isVariableDeclaration(a) ||
        ts.isJsxAttribute(a)) &&
      a.name
    ) {
      names.push(a.name.getText(tree));
      break;
    }
    if (ts.isJsxElement(a)) names.push(a.openingElement.tagName.getText(tree));
  }
  return names.join('.');
}

export function excluded(path) {
  return config.exclude.some(entry => {
    if (!entry.reason) throw new Error('Every exclusion needs a reason');
    return new RegExp(entry.path, 'u').test(path);
  });
}

// Syntax exclusions are structural, not word filters: placeholders/aria/alt are copy.
export function extract(path, source) {
  if (path.endsWith('.css'))
    return [
      ...source
        .replace(/\/\*[^]*?\*\//gu, '')
        .matchAll(/\bcontent\s*:\s*(['"])([^]*?)\1/giu),
    ].map(m => ({
      text: m[2],
      line: source.slice(0, m.index).split('\n').length,
      context: '',
    }));
  if (path.endsWith('.svg'))
    return htmlRows([{ text: source, line: 1, context: '' }]).slice(1);
  if (/\.(?:txt|html|md|mdx)$/u.test(path)) {
    return htmlRows(
      source
        .replace(/<!--[^]*?-->/gu, '')
        .split('\n')
        .map((text, i) => ({
          text,
          line: i + 1,
          context: /^(?:#{1,3} |title:)|<(?:h[1-3]|title)\b/iu.test(text)
            ? 'heading'
            : '',
        }))
    );
  }
  const tree = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.json')
      ? ts.ScriptKind.JSON
      : /\.(?:[jt]sx|js)$/u.test(path)
        ? ts.ScriptKind.TSX
        : ts.ScriptKind.TS
  );
  if (tree.parseDiagnostics.length)
    throw new Error(`${path}: unable to parse copy source`);
  const rows = [];
  function visit(node) {
    if (
      ts.isTypeNode(node) ||
      ts.isImportDeclaration(node) ||
      ts.isExportDeclaration(node)
    )
      return;
    const parent = node.parent;
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const call = node.expression.getText(tree);
      if (
        /(?:^|\.)(?:cn|clsx|cva|twMerge|RegExp|captureError|captureException|captureMessage|captureWarning|describe|querySelector|querySelectorAll|closest|matches|import)$/u.test(
          call
        ) ||
        /^(?:logger|console|sql)\./u.test(call)
      )
        return;
    }
    if (
      ts.isJsxAttribute(node) &&
      nonCopyAttributes.test(node.name.getText(tree))
    )
      return;
    if (
      ts.isPropertyAssignment(node) &&
      /(?:className|ClassName|^style$)/u.test(node.name.getText(tree))
    )
      return;
    if (
      ts.isTaggedTemplateExpression(node) &&
      /^(?:sql|drizzleSql|css)(?:\b|<)/u.test(node.tag.getText(tree))
    )
      return;
    if (
      (ts.isVariableDeclaration(node) || ts.isPropertyAssignment(node)) &&
      nonCopyBindings.test(node.name.getText(tree))
    )
      return;
    if (
      parent?.name === node &&
      (ts.isPropertyAssignment(parent) || ts.isPropertyAccessExpression(parent))
    )
      return;
    if (
      ts.isJsxElement(node) &&
      node.children.some(ts.isJsxElement) &&
      node.children
        .filter(ts.isJsxElement)
        .every(c =>
          /^(?:span|strong|em|b|i|small)$/u.test(
            c.openingElement.tagName.getText(tree)
          )
        )
    )
      rows.push({
        text: fold(node),
        line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
        context: node.openingElement.tagName.getText(tree),
      });
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.PlusToken
    )
      rows.push({
        text: fold(node),
        line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
        context: contextFor(node, tree),
      });
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateExpression(node) ||
      ts.isJsxText(node)
    ) {
      // Preserve dynamic interpolation identities for stable exact exceptions;
      // literal expressions are real copy and participate in phrase matching.
      const text = ts.isTemplateExpression(node)
        ? node.head.text +
          node.templateSpans
            .map((s, i) => {
              const value = fold(s.expression);
              return (
                (value === '\uE000dynamic\uE001' ? `\uE000${i}\uE001` : value) +
                s.literal.text
              );
            })
            .join('')
        : node.text;
      const context = contextFor(node, tree);
      const mergedParent =
        ts.isJsxText(node) &&
        ts.isJsxElement(parent) &&
        parent.children.some(ts.isJsxElement) &&
        parent.children
          .filter(ts.isJsxElement)
          .every(c =>
            /^(?:span|strong|em|b|i|small)$/u.test(
              c.openingElement.tagName.getText(tree)
            )
          );
      if (
        !mergedParent &&
        (ts.isJsxText(node) ||
          headline.test(context) ||
          /^(?:alt|aria-label|aria-description|placeholder|text|children)$/u.test(
            context
          ) ||
          !config.nonCopyValues.some(e => new RegExp(e.source, 'u').test(text)))
      )
        rows.push({
          text,
          line:
            tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
          context,
        });
      if (ts.isTemplateExpression(node))
        for (const span of node.templateSpans) visit(span.expression);
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return htmlRows(rows);
}

export function detect(text, context = '') {
  const clean = text
    .replace(/&#(x[\da-f]+|\d+);/giu, (_, n) =>
      String.fromCodePoint(
        Number(n.toLowerCase().startsWith('x') ? `0${n}` : n)
      )
    )
    .replace(
      /&(?:amp|quot|apos|lt|gt);/gu,
      e =>
        ({
          '&amp;': '&',
          '&quot;': '"',
          '&apos;': "'",
          '&lt;': '<',
          '&gt;': '>',
        })[e]
    )
    .replace(
      /<\/?(?:html|head|body|meta|title|description|text|link|rss|channel|item|pubDate|guid|language|lastBuildDate|atom:link|media:content|div|span|p|a|h[1-6]|strong|em|table|tbody|tr|td|br|img|svg|path)\b[^>]*>/giu,
      ' '
    );
  const value = clean
    .replace(/&(?:nbsp|#160);/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!value && !text.trim()) return [];
  const isHeadline =
    headline.test(context) ||
    /(?:^|\.)(?:h[1-3]|Heading|Button)(?:\.|$)/u.test(context);
  const hits = patterns
    .filter(
      p =>
        (!p.headlineOnly || isHeadline) &&
        p.regex.test(p.id === 'markdown' || p.raw ? text : value)
    )
    .map(p => p.id);
  if (
    isHeadline &&
    !/(?:subhead|subtitle|description|label|action|button|cta)/iu.test(
      context
    ) &&
    (value.length > config.maxHeadlineCharacters ||
      value.split(' ').length > config.maxHeadlineWords)
  )
    hits.push('headline-length');
  return [...new Set(hits)];
}

export function scan(path, source) {
  if (excluded(path)) return [];
  return extract(path, source).flatMap(row =>
    detect(row.text, row.context)
      .filter(
        rule =>
          !config.formats.some(
            a => a.rules.includes(rule) && new RegExp(a.path, 'u').test(path)
          ) &&
          !config.allow.some(a => {
            if (!a.reason)
              throw new Error('Every copy exception needs a reason');
            return (
              a.path === path &&
              a.rules[rule]?.includes(
                createHash('sha256')
                  .update(row.text.trim())
                  .digest('hex')
                  .slice(0, 16)
              )
            );
          })
      )
      .map(rule => ({
        path,
        line: row.line,
        rule,
        text: row.text.trim(),
        key: `${path}:${rule}:${createHash('sha256').update(row.text.trim()).digest('hex').slice(0, 16)}`,
      }))
  );
}

export function ratchet(findings, baseline, base) {
  if (baseline.schema !== config.schema || base.schema !== config.schema)
    throw new Error('Invalid copy-leak baseline schema');
  const counts = {};
  for (const hit of findings) counts[hit.key] = (counts[hit.key] ?? 0) + 1;
  const errors = [];
  for (const [key, count] of Object.entries(baseline.entries)) {
    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > (base.entries[key] ?? 0)
    )
      errors.push(`Baseline may only shrink: ${key}`);
    if (count > (counts[key] ?? 0))
      errors.push(`Remove stale baseline entry: ${key}`);
  }
  for (const hit of findings)
    if (counts[hit.key] > (baseline.entries[hit.key] ?? 0))
      errors.push(
        `${hit.path}:${hit.line} [${hit.rule}] ${hit.text.slice(0, 180)}`
      );
  return errors;
}

export function run(root = process.cwd(), baseRef = 'origin/main') {
  const git = args =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  const files = git(['ls-files', '-z', '--', ...config.roots])
    .split('\0')
    .filter(p => p && config.extensions.includes(extname(p)) && !excluded(p));
  if (!files.length) throw new Error('copy-leak: empty source inventory');
  const findings = files.flatMap(path =>
    scan(path, readFileSync(join(root, path), 'utf8'))
  );
  // Absence permits zero debt; malformed or unreadable baselines still fail.
  let baseline = { schema: config.schema, entries: {} };
  try {
    baseline = JSON.parse(
      readFileSync(join(root, POLICY, 'baseline.json'), 'utf8')
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  // Missing base ref is an error. Only the first introduction may lack a baseline.
  git(['rev-parse', '--verify', baseRef]);
  const base = git([
    'ls-tree',
    '--name-only',
    baseRef,
    `${POLICY}baseline.json`,
  ]).trim()
    ? JSON.parse(git(['show', `${baseRef}:${POLICY}baseline.json`]))
    : { schema: config.schema, entries: {} };
  const errors = ratchet(findings, baseline, base);
  console.log(
    `copy-leak: ${files.length} files, ${findings.length} findings, ${Object.values(baseline.entries).reduce((a, b) => a + b, 0)} baseline`
  );
  for (const error of errors) console.error(error);
  return errors.length ? 1 : 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = run();
  } catch (error) {
    console.error(`copy-leak: ${error.message}`);
    process.exitCode = 1;
  }
}
