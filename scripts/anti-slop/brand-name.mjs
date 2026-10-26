/**
 * ASR-036: the brand is "Jovie", the domain is "jov.ie". Flags misspellings,
 * near-misses (edit distance 1-2 on capitalized J-words), the wrong domain and
 * wrong casing in prose. "Jovi" is allowed only where it names the agent.
 *
 *   node scripts/anti-slop/brand-name.mjs                       whole repo vs baseline (CI)
 *   node scripts/anti-slop/brand-name.mjs --diff-base origin/main   added lines only
 *   node scripts/anti-slop/brand-name.mjs --text-file msg.txt   commit message or PR body
 *   node scripts/anti-slop/brand-name.mjs --files a.md b.html
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from './lib.mjs';

export const BASELINE = 'scripts/anti-slop/brand-name.baseline.json';
const EXPLICIT =
  /(?<![\w@/.-])(?:Jovy|Jovee|Jovei|Jovvie|Jovies|J0vie|Jovey|Jouvie|Jovvy|Jovye)(?![\w@/-])/giu;
const DOMAIN = /(?<!test\.)(?<!app\.)\bjovie\.(?:com|io)\b/giu;
/** jovie.com is an unrelated company (Bright Horizons); copy that disambiguates it is correct. */
const DOMAIN_OK_CONTEXT =
  /childcare|Bright Horizons|unrelated|separate (?:company|compan)|different company/iu;
const WORD = /(?<![\w@/.:#$-])[A-Za-z0-9]{3,8}(?![\w@/:-]|\.\w)/gu;
/** Real words and names within edit distance 2 of Jovie that must never be flagged. */
const NOT_BRAND = new Set([
  'jove',
  'jovial',
  'jovian',
  'joyce',
  'joule',
  'jolie',
  'joke',
  'joked',
  'joker',
  'jobs',
  'joins',
  'joined',
  'joyed',
  'joy',
  'jody',
  'jodie',
  'josie',
  'jovita',
]);
/** "Jovi" names the agent only in these contexts (Summer Jovi, Jovi coach, Jovi Technology Inc). */
const JOVI_OK =
  /\b(?:Summer Jovi|Jovi Technology|Jovi (?:coach|agent|health|AI|chat|memory|works)|(?:through|ask|ask|with|from|to) Jovi\b.*\b(?:agent|coach|health|memory)|AI Agent)\b|\b(?:agent|coach|health|memory)\b.*\bJovi\b/iu;
const PROSE = /\.(?:md|mdx|txt|html|htm)$/iu;
const SKIP_PATH =
  /(?:^|\/)(?:pnpm-lock\.yaml|CHANGELOG\.md|node_modules\/|\.git\/)|\.(?:png|jpe?g|webp|avif|svg|ico|pen|xcodeproj|pbxproj|lock|woff2?)$|brand-name\.(?:mjs|test\.mjs|baseline\.json)$|anti-slop-rules\.json$/iu;
const BINARY_LIKE =
  /\.(?:png|jpe?g|gif|webp|avif|pdf|zip|mp4|mov|woff2?|ttf|otf|icns|ico)$/iu;

export function distance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const next = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diag = prev[j];
      prev[j] = next;
    }
  }
  return prev[b.length];
}

/** Blank out inline code and URLs so identifiers and links are not read as prose. */
function proseOnly(line) {
  return line
    .replace(/`[^`]*`/gu, m => ' '.repeat(m.length))
    .replace(/https?:\/\/\S+/gu, m => ' '.repeat(m.length));
}

export function scanLine(line, { prose = false } = {}) {
  const found = [];
  const text = prose
    ? proseOnly(line)
    : line.replace(/https?:\/\/\S+/gu, m => ' '.repeat(m.length));
  for (const m of text.matchAll(EXPLICIT))
    found.push({ kind: 'misspelling', text: m[0] });
  if (!DOMAIN_OK_CONTEXT.test(line))
    for (const m of line.matchAll(DOMAIN))
      found.push({ kind: 'domain', text: m[0] });
  for (const m of text.matchAll(WORD)) {
    const word = m[0];
    const low = word.toLowerCase();
    if (low === 'jovie' || NOT_BRAND.has(low) || EXPLICIT.test(word)) {
      EXPLICIT.lastIndex = 0;
      continue;
    }
    EXPLICIT.lastIndex = 0;
    if (low === 'jovi') {
      if (/^Jovi$/u.test(word) && !JOVI_OK.test(line))
        found.push({ kind: 'jovi-outside-agent-context', text: word });
      continue;
    }
    if (
      /^J[o0u]v/u.test(word) &&
      !low.startsWith('jovie') &&
      word.length >= 4 &&
      distance(low, 'jovie') <= 2 &&
      !/^[A-Z]+$/u.test(word)
    ) {
      found.push({ kind: 'near-miss', text: word });
    }
  }
  if (prose) {
    for (const m of text.matchAll(
      /(?<![\w@/.:#$-])(?:jovie|JOVIE|JoVie|jOVIE)(?![\w@/:-]|\.\w)/gu
    )) {
      found.push({ kind: 'casing', text: m[0] });
    }
  }
  return found;
}

export function scanText(text, { file = '', prose = PROSE.test(file) } = {}) {
  const hits = [];
  let fenced = false;
  text.split('\n').forEach((line, index) => {
    if (prose && /^\s*(?:```|~~~)/u.test(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    for (const hit of scanLine(line, { prose }))
      hits.push({
        file,
        line: index + 1,
        ...hit,
        context: line.trim().slice(0, 120),
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

export function scanRepo(root = REPO_ROOT) {
  const hits = [];
  for (const file of git(root, ['ls-files', '-z'])
    .split('\0')
    .filter(Boolean)) {
    if (
      SKIP_PATH.test(file) ||
      BINARY_LIKE.test(file) ||
      !existsSync(join(root, file))
    )
      continue;
    let text;
    try {
      text = readFileSync(join(root, file), 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\0')) continue;
    hits.push(...scanText(text, { file }));
  }
  return hits;
}

export function scanDiff(base, root = REPO_ROOT) {
  const hits = [];
  const patch = git(root, [
    'diff',
    '--unified=0',
    '--no-color',
    `${base}...HEAD`,
  ]);
  let file = '';
  let line = 0;
  for (const row of patch.split('\n')) {
    if (row.startsWith('+++ b/')) {
      file = row.slice(6);
      continue;
    }
    const hunk = row.match(/^@@ -\d+(?:,\d+)? \+(\d+)/u);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (row.startsWith('+') && !row.startsWith('+++')) {
      if (!SKIP_PATH.test(file) && !BINARY_LIKE.test(file)) {
        for (const hit of scanLine(row.slice(1), { prose: PROSE.test(file) }))
          hits.push({
            file,
            line,
            ...hit,
            context: row.slice(1).trim().slice(0, 120),
          });
      }
      line += 1;
    }
  }
  return hits;
}

const key = h => `${h.file}\t${h.kind}`;
export function compareToBaseline(hits, baseline) {
  const counts = new Map();
  for (const h of hits) counts.set(key(h), (counts.get(key(h)) ?? 0) + 1);
  const failures = [];
  for (const [k, n] of counts) {
    const allowed = baseline[k] ?? 0;
    if (n > allowed)
      failures.push(
        `${k.replace('\t', ' ')}: ${n} hit(s), baseline ${allowed}`
      );
  }
  return failures;
}

function main(argv) {
  const arg = name => argv[argv.indexOf(name) + 1];
  if (argv.includes('--text-file')) {
    const hits = scanText(readFileSync(arg('--text-file'), 'utf8'), {
      file: 'message.md',
      prose: true,
    });
    for (const h of hits)
      process.stderr.write(
        `ASR-036 ${h.kind} "${h.text}" line ${h.line}: ${h.context}\n`
      );
    return hits.length ? 1 : 0;
  }
  if (argv.includes('--files')) {
    const files = argv.slice(argv.indexOf('--files') + 1);
    const hits = files.flatMap(f =>
      scanText(readFileSync(f, 'utf8'), { file: f })
    );
    for (const h of hits)
      process.stderr.write(
        `ASR-036 ${h.kind} "${h.text}" ${h.file}:${h.line}: ${h.context}\n`
      );
    return hits.length ? 1 : 0;
  }
  if (argv.includes('--diff-base')) {
    const hits = scanDiff(arg('--diff-base'));
    for (const h of hits)
      process.stderr.write(
        `ASR-036 ${h.kind} "${h.text}" ${h.file}:${h.line}: ${h.context}\n`
      );
    return hits.length ? 1 : 0;
  }
  const hits = scanRepo();
  if (argv.includes('--write-baseline')) {
    const counts = {};
    for (const h of hits) counts[key(h)] = (counts[key(h)] ?? 0) + 1;
    writeFileSync(
      join(REPO_ROOT, BASELINE),
      JSON.stringify(
        Object.fromEntries(Object.entries(counts).sort()),
        null,
        2
      ) + '\n'
    );
    process.stdout.write(
      `baseline: ${hits.length} hits in ${Object.keys(counts).length} file/kind pairs\n`
    );
    return 0;
  }
  const baseline = existsSync(join(REPO_ROOT, BASELINE))
    ? JSON.parse(readFileSync(join(REPO_ROOT, BASELINE), 'utf8'))
    : {};
  const failures = compareToBaseline(hits, baseline);
  if (argv.includes('--list'))
    for (const h of hits)
      process.stdout.write(
        `${h.kind}\t"${h.text}"\t${h.file}:${h.line}\t${h.context}\n`
      );
  if (failures.length) {
    process.stderr.write(failures.join('\n') + '\n');
    return 1;
  }
  process.stdout.write(`brand-name: ok (${hits.length} baselined hits)\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  process.exitCode = main(process.argv.slice(2));
