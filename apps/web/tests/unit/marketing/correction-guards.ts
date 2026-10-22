// Test-only repo scanner. Sync filesystem reads stay under tests/ so
// JOV-INV-031 does not treat them as request-path thread-blocking I/O.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PHRASE_AND_NAME_ROOTS = [
  'apps/web/app/(home)',
  'apps/web/app/(marketing)',
  'apps/web/components/homepage',
  'apps/web/components/features/home',
  'apps/web/components/marketing',
  'apps/web/components/site',
  'apps/web/content',
  'apps/web/data/marketing',
  'apps/web/lib/constants/schemas.ts',
] as const;

export const JSX_ROOTS = [
  'apps/web/app/(home)',
  'apps/web/components/homepage',
  'apps/web/components/marketing',
  'apps/web/components/site',
] as const;

// Tim's explicit 2026-10-21 entry refinement; keep the exact-copy invariant.
export const LOCKED_HOMEPAGE_H1 = 'Start with your name';

const SOURCE_EXT = /\.(?:tsx?|mdx?)$/u;
const SKIP_FILE = /\.(?:test|spec|stories)\./u;
const SKIP_PATH = /\/(?:content\/legal|content\/investors)\//u;
const JSX_TEXT = />([^<>{}]*[A-Za-z][^<>{}]*)</gu;
const USER_FACING_ATTR =
  /\b(?:aria-label|aria-description|alt|title|placeholder)\s*=\s*(?:\{\s*)?(['"`])([^'"`\n]+)\1/gu;

const BANNED_NAME_RULES = [
  { id: 'daniel-kang', pattern: /\bDaniel\s+Kang\b/giu },
  { id: 'haruki', pattern: /\bHaruki\b/giu },
] as const;

const PHRASE_RULES = [
  { id: 'link-in-bio', pattern: /\blink[\s-]in[\s-]bio\b/giu },
  {
    id: 'niche-music',
    pattern:
      /\b(?:niche[-\s]music|for musicians|musician-first|music creators|music-only|only for music)\b/giu,
  },
] as const;

export interface CorrectionHit {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly text: string;
}

export interface WarnBaseline {
  readonly schema: 'jovie.correction-guard-baseline/v1';
  readonly mode: 'warn';
  readonly issue: string;
  readonly tighten: 'auto';
  readonly count: number;
  readonly violations: readonly string[];
}

type KeyDiff = {
  readonly added: string[];
  readonly removed: string[];
};

export function repoRootFromModule(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../');
}

export function diffKeys(
  current: readonly string[],
  baseline: readonly string[]
): KeyDiff {
  const live = new Set(current);
  const known = new Set(baseline);
  return {
    added: current.filter(key => !known.has(key)),
    removed: baseline.filter(key => !live.has(key)),
  };
}

type TightenResult<T extends WarnBaseline> = KeyDiff & {
  readonly baseline: T;
  readonly tightened: boolean;
};

export function tightenBaseline<T extends WarnBaseline>(
  baseline: T,
  current: readonly string[]
): TightenResult<T> {
  const { added, removed } = diffKeys(current, baseline.violations);
  if (added.length > 0 || removed.length === 0) {
    return { baseline, added, removed, tightened: false };
  }
  return {
    baseline: { ...baseline, count: current.length, violations: current },
    added,
    removed,
    tightened: true,
  };
}

export function violationKey(
  hit: Pick<CorrectionHit, 'file' | 'rule' | 'text'>
): string {
  return `${hit.file} :: ${hit.rule} :: ${hit.text}`;
}

export function keysFor(hits: readonly CorrectionHit[]): string[] {
  const seen = new Map<string, number>();
  return hits.map(hit => {
    const base = violationKey(hit);
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    return occurrence === 1 ? base : `${base} #${occurrence}`;
  });
}

export function stripComments(source: string): string {
  let out = '';
  let index = 0;
  while (index < source.length) {
    const char = source[index] ?? '';
    if (source.startsWith('/*', index) || source.startsWith('//', index)) {
      const block = source.startsWith('/*', index);
      const found = source.indexOf(block ? '*/' : '\n', index + 2);
      const next = found === -1 ? source.length : found + (block ? 2 : 0);
      out += source.slice(index, next).replace(/[^\n]/gu, ' ');
      index = next;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      out += char;
      index += 1;
      while (index < source.length) {
        const current = source[index] ?? '';
        if (current === '\\') {
          out += current + (source[index + 1] ?? '');
          index += 2;
          continue;
        }
        out += current;
        index += 1;
        if (current === char) break;
      }
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

function lineAt(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

function isUserFacing(text: string): boolean {
  const trimmed = normalizeText(text);
  if (trimmed.length < 3 || trimmed.length > 240) return false;
  if (!/[A-Za-z]/u.test(trimmed)) return false;
  if (/[;{}=&|<>]/.test(trimmed)) return false;
  if (/^(?:https?:|\/|@\/|\.\.?\/)/u.test(trimmed)) return false;
  if (/^[,:;.\-)]/u.test(trimmed)) return false;
  return (
    trimmed.includes(' ') || /^[A-Z]/u.test(trimmed) || trimmed.length >= 12
  );
}

function isPathOrSlug(excerpt: string, rule: string): boolean {
  if (
    excerpt.includes('/') ||
    excerpt.startsWith('.') ||
    excerpt.startsWith('@')
  ) {
    return true;
  }
  return rule === 'link-in-bio' && !excerpt.includes(' ');
}

function excerptAround(source: string, index: number, length: number): string {
  let quoteStart = -1;
  let quote = '';
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const char = source[cursor] ?? '';
    if (char === '\n') break;
    if (char === '"' || char === "'" || char === '`') {
      quoteStart = cursor;
      quote = char;
      break;
    }
  }
  const lineStart = source.lastIndexOf('\n', index) + 1;
  const lineEnd = source.indexOf('\n', index);
  const line = source.slice(
    lineStart,
    lineEnd === -1 ? source.length : lineEnd
  );
  let text = line.replace(/<[^>\n]*>/gu, ' ');
  if (quoteStart >= 0) {
    let end = index + length;
    while (
      end < source.length &&
      source[end] !== '\n' &&
      source[end] !== quote
    ) {
      end += 1;
    }
    if (source[end] === quote) text = source.slice(quoteStart + 1, end);
  }
  const normalized = normalizeText(text);
  if (normalized.length <= 180) return normalized;
  const match = normalizeText(source.slice(index, index + length));
  const at = Math.max(0, normalized.indexOf(match));
  let from = Math.max(0, at - 40);
  if (from > 0) {
    const space = normalized.indexOf(' ', from);
    if (space !== -1 && space < at) from = space + 1;
  }
  let to = Math.min(normalized.length, from + 160);
  if (to < normalized.length) {
    const space = normalized.lastIndexOf(' ', to);
    if (space > at) to = space;
  }
  return normalized.slice(from, to);
}

function collectPatternHits(
  file: string,
  source: string,
  rules: readonly { readonly id: string; readonly pattern: RegExp }[],
  useExcerpt: boolean
): CorrectionHit[] {
  const hits: CorrectionHit[] = [];
  for (const rule of rules) {
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    for (const match of source.matchAll(pattern)) {
      const text = useExcerpt
        ? excerptAround(source, match.index ?? 0, match[0]?.length ?? 0)
        : normalizeText(match[0] ?? '');
      if (!text) continue;
      if (
        (rule.id === 'link-in-bio' || rule.id === 'niche-music') &&
        isPathOrSlug(text, rule.id)
      ) {
        continue;
      }
      hits.push({
        file,
        line: lineAt(source, match.index ?? 0),
        rule: rule.id,
        text,
      });
    }
  }
  return hits;
}

export function findBannedNames(
  source: string,
  file = '(sample)'
): CorrectionHit[] {
  return collectPatternHits(file, source, BANNED_NAME_RULES, false);
}

export function findBannedPhrases(
  source: string,
  file = '(sample)'
): CorrectionHit[] {
  return collectPatternHits(file, stripComments(source), PHRASE_RULES, true);
}

export function findRawJsxCopy(
  source: string,
  file = '(sample)'
): CorrectionHit[] {
  const stripped = stripComments(source);
  const hits: CorrectionHit[] = [];
  const push = (index: number, text: string, rule: string) => {
    const normalized = normalizeText(text);
    if (!isUserFacing(normalized)) return;
    hits.push({ file, line: lineAt(stripped, index), rule, text: normalized });
  };
  for (const match of stripped.matchAll(JSX_TEXT)) {
    push(match.index ?? 0, match[1] ?? '', 'raw-jsx');
  }
  for (const match of stripped.matchAll(USER_FACING_ATTR)) {
    push(match.index ?? 0, match[2] ?? '', 'raw-jsx-attr');
  }
  return hits;
}

function isScannable(repoRoot: string, file: string): boolean {
  const rel = relative(repoRoot, file).split('\\').join('/');
  return (
    SOURCE_EXT.test(rel) &&
    !SKIP_FILE.test(rel) &&
    !SKIP_PATH.test(`/${rel}`) &&
    statSync(file).isFile()
  );
}

function walk(repoRoot: string, directory: string, out: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) walk(repoRoot, absolute, out);
    else if (entry.isFile() && isScannable(repoRoot, absolute))
      out.push(absolute);
  }
}

export function listCorrectionFiles(
  repoRoot: string,
  roots: readonly string[]
): string[] {
  const files: string[] = [];
  for (const root of roots) {
    const absolute = resolve(repoRoot, root);
    const stats = statSync(absolute, { throwIfNoEntry: false });
    if (!stats) continue;
    if (stats.isDirectory()) walk(repoRoot, absolute, files);
    else if (isScannable(repoRoot, absolute)) files.push(absolute);
  }
  const dataDir = join(repoRoot, 'apps/web/data');
  for (const name of readdirSync(dataDir)) {
    if (!name.endsWith('Copy.ts') && name !== 'companyIdentity.ts') continue;
    const absolute = join(dataDir, name);
    if (isScannable(repoRoot, absolute)) files.push(absolute);
  }
  return [
    ...new Set(
      files.map(file => relative(repoRoot, file).split('\\').join('/'))
    ),
  ].sort();
}

function readHits(
  repoRoot: string,
  files: readonly string[],
  read: (source: string, file: string) => readonly CorrectionHit[]
): CorrectionHit[] {
  return files.flatMap(file =>
    read(readFileSync(join(repoRoot, file), 'utf8'), file)
  );
}

export function scanBannedNames(
  repoRoot: string,
  roots: readonly string[] = PHRASE_AND_NAME_ROOTS
): CorrectionHit[] {
  return readHits(
    repoRoot,
    listCorrectionFiles(repoRoot, roots),
    findBannedNames
  );
}

export function scanBannedPhrases(
  repoRoot: string,
  roots: readonly string[] = PHRASE_AND_NAME_ROOTS
): string[] {
  return keysFor(
    readHits(repoRoot, listCorrectionFiles(repoRoot, roots), findBannedPhrases)
  );
}

export function scanRawJsx(
  repoRoot: string,
  roots: readonly string[] = JSX_ROOTS
): string[] {
  const files = listCorrectionFiles(repoRoot, roots).filter(file =>
    file.endsWith('.tsx')
  );
  return keysFor(readHits(repoRoot, files, findRawJsxCopy));
}
