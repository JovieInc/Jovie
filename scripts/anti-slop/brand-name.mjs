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
const DOMAIN_OK_CONTEXT =
  /childcare|Bright Horizons|unrelated|separate company|different company/iu;
const WORD = /(?<![\w@/.:#$-])Jovi(?![\w@/:-]|\.\w)/gu;
const PROSE = /\.(?:md|mdx|txt|html|htm)$/iu;
const SKIP_PATH =
  /(?:^|\/)(?:pnpm-lock\.yaml|CHANGELOG\.md)$|(?:^|\/)(?:node_modules|\.git|__snapshots__)(?:\/|$)|\.(?:png|jpe?g|webp|avif|svg|ico|pen|xcodeproj|pbxproj|lock|woff2?)$/iu;
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

export function scanLine(line, { prose = false } = {}) {
  const found = [];
  const text = proseOnly(line, prose);
  for (const m of text.matchAll(EXPLICIT))
    found.push({ kind: 'misspelling', text: m[0] });
  if (!DOMAIN_OK_CONTEXT.test(text))
    for (const m of text.matchAll(DOMAIN))
      found.push({ kind: 'domain', text: m[0] });
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
  if (prose) {
    for (const m of text.matchAll(/(?<![\w@/.:#$-])jovie(?![\w@/:-]|\.\w)/giu))
      if (m[0] !== 'Jovie') found.push({ kind: 'casing', text: m[0] });
  }
  return found;
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
  // Mask only the frozen span; preserve line numbers and neighboring prose.
  for (const e of exceptions.filter(e => e.file === file))
    text = text.replaceAll(e.match, e.match.replace(/[^\n]/gu, ' '));
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
    for (const hit of scanLine(line, { prose }))
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
    (brand && (SKIP_PATH.test(name) || GUARD_SOURCES.has(name))) ||
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
