/**
 * ASR-036: the brand is "Jovie", the domain is "jov.ie". Flags enumerated spelling
 * mistakes, the wrong domain and wrong casing in prose. "Jovi" is allowed only where it names the agent.
 *
 *   node scripts/anti-slop/brand-name.mjs                       whole repo (CI)
 *   node scripts/anti-slop/brand-name.mjs --diff-base origin/main   added lines only
 *   node scripts/anti-slop/brand-name.mjs --text-file msg.txt   commit message or PR body
 *   node scripts/anti-slop/brand-name.mjs --files a.md b.html
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from './lib.mjs';

/** Frozen verbatim or historical text. Each entry needs a reason. */
export const EXCEPTIONS = JSON.parse(
  readFileSync(new URL('./brand-name.exceptions.json', import.meta.url), 'utf8')
).exceptions;
const EXPLICIT =
  /(?<![\w@/.-])(?:Jovy|Jovee|Jovei|Jovvie|Jovies|J0vie|Jovey|Jouvie|Jovvy|Jovye)(?![\w@/-])/giu;
// App/test fixture domains are literals. Emails and URLs are masked below.
const DOMAIN = /(?<![\w@-])(?<!test\.)(?<!app\.)jovie\.(?:com|io)\b/giu;
// Attach the external-company description to this occurrence, never the line.
const EXTERNAL_COMPANY =
  '(?:childcare(?: franchise| company| service| business)?|Bright Horizons|(?:separate|different) company)';
const EXTERNAL_BEFORE = new RegExp(
  `\\b${EXTERNAL_COMPANY}(?:'s)?(?: (?:is at|at|uses|website is|domain is))?\\s*$`,
  'iu'
);
const EXTERNAL_AFTER = new RegExp(
  `^(?:\\s+(?:is|belongs to) (?:the |a )?${EXTERNAL_COMPANY}\\b|\\s+\\(Bright Horizons\\))`,
  'iu'
);
const WORD = /(?<![\w@/.:#$-])Jovi(?![\w@/:-]|\.\w)/gu;
const PROSE = /\.(?:md|mdx|txt|html|htm)$/iu;
const CODE = /\.[cm]?[jt]sx?$/iu;
const requireHere = createRequire(import.meta.url);
let ts;
const HISTORICAL_FILES = new Set(['pnpm-lock.yaml', 'CHANGELOG.md']);
const SKIP_PATH =
  /(?:^|\/)(?:node_modules|\.git|__snapshots__)(?:\/|$)|\.(?:png|jpe?g|webp|avif|svg|ico|pen|xcodeproj|pbxproj|lock|woff2?)$/iu;
// These exact sources contain the guard's deliberate negative examples.
const GUARD_SOURCES = new Set([
  'scripts/anti-slop/brand-name.mjs',
  'scripts/anti-slop/brand-name-messages.mjs',
  'scripts/anti-slop/brand-name.exceptions.json',
  'scripts/lib/__tests__/brand-name.test.mjs',
  'docs/design-system/anti-slop-rules.json',
]);
const BINARY_LIKE =
  /\.(?:png|jpe?g|gif|webp|avif|pdf|zip|mp4|mov|woff2?|ttf|otf|icns|ico)$/iu;
const CASING_WORD = /(?<![\w@/.:#$-])jovie(?![\w@/:-]|\.\w)/giu;

function hasCasingCandidate(text) {
  for (const match of text.matchAll(CASING_WORD))
    if (match[0] !== 'Jovie') return true;
  return false;
}

const QUOTED_COMMAND =
  /\\?(["'])(pnpm|npm|npx|node|yarn|bun|jovie)(?:[ \t]+[\w@./:<>{}=-]+)+\\?\1/gu;

/** Preserve offsets while excluding literal code and links from prose. */
function proseOnly(line, prose) {
  let text = line
    .replace(/https?:\/\/[^\s<>"']+/giu, m => ' '.repeat(m.length))
    .replace(/\b[\w.%+-]+@(?:[\w-]+\.)+[a-z]{2,}\b/giu, m =>
      ' '.repeat(m.length)
    );
  if (prose)
    text = text.replace(/(`+)(.*?)\1(?!`)/gu, m => ' '.repeat(m.length));
  return text;
}

export function scanLine(line, { prose = false, casing = prose } = {}) {
  const found = [];
  const text = proseOnly(line, prose);
  for (const m of text.matchAll(EXPLICIT))
    found.push({ kind: 'misspelling', text: m[0] });
  for (const m of text.matchAll(DOMAIN)) {
    if (
      m[0].toLowerCase() === 'jovie.com' &&
      (EXTERNAL_BEFORE.test(text.slice(0, m.index)) ||
        EXTERNAL_AFTER.test(text.slice(m.index + m[0].length)))
    )
      continue;
    found.push({ kind: 'domain', text: m[0] });
  }
  for (const m of text.matchAll(WORD)) {
    // Exempt this occurrence only: agent names and the real band name.
    const before = text.slice(0, m.index);
    const after = text.slice(m.index + m[0].length);
    if (
      /\b(?:Summer|Bon) $/u.test(before) ||
      /^ (?:coach\b|Technology Inc\b)/u.test(after)
    )
      continue;
    found.push({ kind: 'jovi-outside-agent-context', text: m[0] });
  }
  if (casing) {
    for (const m of text.matchAll(CASING_WORD))
      if (m[0] !== 'Jovie') found.push({ kind: 'casing', text: m[0] });
  }
  return found;
}

/** Bounded copy-role context, following the existing copy-inventory key pattern. */
function isPresentationCopy(node, ast) {
  let owner = node.parent;
  if (ts.isTemplateSpan(owner)) owner = owner.parent;
  if (ts.isTemplateExpression(owner)) owner = owner.parent;
  if (ts.isJsxExpression(owner)) owner = owner.parent;
  if (ts.isJsxElement(owner) || ts.isJsxFragment(owner)) return true;
  if (ts.isJsxAttribute(owner))
    return /^(?:aria-label|title|placeholder|alt|label|children)$/u.test(
      owner.name.getText(ast)
    );
  return (
    (ts.isVariableDeclaration(owner) || ts.isPropertyAssignment(owner)) &&
    (ts.isIdentifier(owner.name) || ts.isStringLiteral(owner.name)) &&
    /^(?:headline|heading|title|subhead|subtitle|label|description|placeholder|alt|caption|text|body|summary|cta|buttonLabel)$/u.test(
      owner.name.text
    )
  );
}

/**
 * Parser/literal pattern from product-reference-coherence and copy-inventory.
 * Keep offsets and newlines. Only JSX copy or named copy roles establish
 * presentation intent; whitespace in arbitrary literals does not. Quoted
 * product names remain prose in those roles. No path exemptions or data flow.
 */
function codeCopy(text, file) {
  ts ??= requireHere('typescript');
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const chars = text.split('').map(c => (c === '\n' ? c : ' '));
  const visit = node => {
    const literal =
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node);
    if (ts.isJsxText(node) || literal) {
      const parent = node.parent;
      const rendered = isPresentationCopy(node, ast);
      if (
        ts.isJsxText(node) ||
        (literal &&
          !ts.isLiteralTypeNode(parent) &&
          parent.name !== node &&
          rendered)
      ) {
        // Strip syntax delimiters, not inline backticks in the rendered content.
        const start = node.getStart(ast) + (literal ? 1 : 0);
        const end =
          node.end -
          (literal
            ? ts.isTemplateHead(node) || ts.isTemplateMiddle(node)
              ? 2
              : 1
            : 0);
        const content = proseOnly(text.slice(start, end), true)
          .replace(
            /\b(?:run|execute|cli|command):?[ \t]+(jovie)(?=[ \t]+[\w-])/giu,
            (match, tool) =>
              tool === 'jovie' ? match.slice(0, -5) + '     ' : match
          )
          .replace(QUOTED_COMMAND, (m, _quote, tool, offset, source) =>
            tool === 'jovie' &&
            !/\b(?:run|execute|cli|command):?[ \t]+$/iu.test(
              source.slice(0, offset)
            )
              ? m
              : ' '.repeat(m.length)
          );
        for (let i = 0; i < content.length; i += 1)
          chars[start + i] = content[i];
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return chars.join('');
}

/** Conventional-commit scopes like chore(jovie): are identifiers, not prose. */
export function stripCommitScopes(text) {
  return text.replace(/^(\w+)\([^)\n]*\)(!?:)/gmu, '$1$2');
}

export function scanText(
  text,
  { file = '', prose = PROSE.test(file), exceptions = EXCEPTIONS } = {}
) {
  const hits = [];
  const originalLines = text.split('\n');
  for (const e of exceptions) {
    if (
      typeof e.file !== 'string' ||
      !e.file.trim() ||
      typeof e.match !== 'string' ||
      !e.match.trim() ||
      typeof e.reason !== 'string' ||
      !e.reason.trim()
    )
      throw new Error(
        'Brand exceptions require a file, exact match and reason'
      );
  }
  // Mask checked tokens only within the exact frozen span. Preserve syntax so
  // an excepted property or JSX specimen cannot hide adjacent parsed copy.
  for (const e of exceptions.filter(e => e.file === file)) {
    let masked = e.match;
    for (const pattern of [DOMAIN, EXPLICIT, WORD, CASING_WORD])
      masked = masked.replace(pattern, match => ' '.repeat(match.length));
    text = text.replaceAll(e.match, masked);
  }
  const copyLines =
    !prose && CODE.test(file) && hasCasingCandidate(text)
      ? codeCopy(text, file).split('\n')
      : [];
  const frontmatterEnd =
    /(?:^|\/)SKILL\.md$/u.test(file) && text.startsWith('---\n')
      ? text.indexOf('\n---', 4)
      : -1;
  let offset = 0;
  let fence = null;
  text.split('\n').forEach((line, index) => {
    const inSkillHeader = offset < frontmatterEnd;
    offset += line.length + 1;
    if (inSkillHeader)
      line = line.replace(
        /^(name: )([a-z][a-z0-9-]*)$/u,
        (_, prefix, slug) => prefix + ' '.repeat(slug.length)
      );
    const marker = prose && line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/u);
    if (fence) {
      if (
        marker &&
        marker[1][0] === fence[0] &&
        marker[1].length >= fence.length &&
        !marker[2].trim()
      )
        fence = null;
      return;
    }
    if (marker) {
      fence = marker[1];
      return;
    }
    const lineHits = scanLine(line, { prose });
    if (copyLines.length)
      lineHits.push(
        ...scanLine(copyLines[index], { casing: true }).filter(
          hit => hit.kind === 'casing'
        )
      );
    for (const hit of lineHits)
      hits.push({
        file,
        line: index + 1,
        ...hit,
        context: originalLines[index].trim().slice(0, 120),
      });
  });
  return hits;
}

const git = (root, args) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });

/** All file entry points share path, deletion and binary filtering. */
export function readScanFile(file, root = REPO_ROOT, { brand = true } = {}) {
  const path = resolve(root, file);
  const name = relative(root, path).split(sep).join('/');
  if (
    (brand &&
      (HISTORICAL_FILES.has(name) ||
        SKIP_PATH.test(name) ||
        GUARD_SOURCES.has(name))) ||
    BINARY_LIKE.test(name)
  )
    return null;
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if (['ENOENT', 'EISDIR'].includes(error.code)) return null;
    throw error;
  }
  return text.includes('\0') ? null : { file: name, text };
}

export function scanFiles(files, root = REPO_ROOT) {
  return files.flatMap(file => {
    const input = readScanFile(file, root);
    return input ? scanText(input.text, { file: input.file }) : [];
  });
}

export function scanRepo(root = REPO_ROOT) {
  return scanFiles(
    git(root, ['ls-files', '-z']).split('\0').filter(Boolean),
    root
  );
}

export function scanDiff(base, root = REPO_ROOT) {
  const range = `${base}...HEAD`;
  const files = git(root, [
    'diff',
    '--name-only',
    '-z',
    '--diff-filter=ACMR',
    range,
  ])
    .split('\0')
    .filter(Boolean);
  return files.flatMap(file => {
    if (!readScanFile(file, root)) return [];
    const patch = git(root, [
      'diff',
      '--unified=0',
      '--no-color',
      '--no-ext-diff',
      '--no-textconv',
      range,
      '--',
      file,
    ]);
    const added = new Set();
    for (const match of patch.matchAll(
      /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gmu
    )) {
      const start = Number(match[1]);
      const count = match[2] === undefined ? 1 : Number(match[2]);
      for (let line = start; line < start + count; line += 1) added.add(line);
    }
    const text = git(root, ['show', `HEAD:${file}`]);
    return scanText(text, { file }).filter(hit => added.has(hit.line));
  });
}

export function main(argv, root = REPO_ROOT) {
  const arg = name => argv[argv.indexOf(name) + 1];
  if (argv.includes('--text-file')) {
    const hits = scanText(
      stripCommitScopes(readFileSync(arg('--text-file'), 'utf8')),
      {
        file: 'message.md',
        prose: true,
      }
    );
    for (const h of hits)
      process.stderr.write(
        `ASR-036 ${h.kind} "${h.text}" line ${h.line}: ${h.context}\n`
      );
    return hits.length ? 1 : 0;
  }
  if (argv.includes('--files')) {
    const files = argv.slice(argv.indexOf('--files') + 1);
    const hits = scanFiles(files, root);
    for (const h of hits)
      process.stderr.write(
        `ASR-036 ${h.kind} "${h.text}" ${h.file}:${h.line}: ${h.context}\n`
      );
    return hits.length ? 1 : 0;
  }
  if (argv.includes('--diff-base')) {
    const hits = scanDiff(arg('--diff-base'), root);
    for (const h of hits)
      process.stderr.write(
        `ASR-036 ${h.kind} "${h.text}" ${h.file}:${h.line}: ${h.context}\n`
      );
    return hits.length ? 1 : 0;
  }
  const hits = scanRepo(root);
  if (argv.includes('--list'))
    for (const h of hits)
      process.stdout.write(
        `${h.kind}\t"${h.text}"\t${h.file}:${h.line}\t${h.context}\n`
      );
  if (hits.length) {
    for (const h of hits)
      process.stderr.write(
        `ASR-036 ${h.file}:${h.line} ${h.kind} "${h.text}": ${h.context}\n`
      );
    return 1;
  }
  process.stdout.write('brand-name: ok (0 hits; no baseline)\n');
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  process.exitCode = main(process.argv.slice(2));
