/**
 * Warn-only inventory of all-caps eyebrows on marketing routes.
 *
 * Flags tracked-caps and named eyebrow/kicker/overline rules under the
 * homepage and `(marketing)` routes, plus the marketing components those
 * routes render. Product UI is outside the scan. `armed: true` fails when
 * the live count moves. Lower the baseline count in the same change that
 * removes hits. Growth fails. This file does not change Clef.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

export const MARKETING_EYEBROW_CAPS_ROOTS = [
  'apps/web/app/(marketing)',
  'apps/web/app/(home)',
  'apps/web/components/marketing',
] as const;

const SOURCE_EXT = /\.(?:css|tsx?|jsx?)$/;
const SKIP_FILE = /\.(?:test|spec|stories)\.[cm]?[jt]sx?$/;
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.turbo',
  'generated',
  'dist',
  'storybook-static',
]);

const EYEBROW_NAME =
  /(?:^|[^A-Za-z0-9])(?:eyebrow|kicker|overline)(?![A-Za-z0-9])/i;
const UPPERCASE_DECL = /text-transform:\s*uppercase/;
const ZERO_TRACKING = /^(?:0|0px|0em|normal|inherit|initial|unset)$/;

export interface MarketingEyebrowCapsHit {
  readonly file: string;
  readonly line: number;
  readonly kind: 'tracked-caps' | 'named-eyebrow';
  readonly text: string;
}

export type EyebrowCapsRatchetStatus = 'ok' | 'regression' | 'shrink';

export function evaluateWarnOnlyCount(
  count: number,
  baseline: number
): EyebrowCapsRatchetStatus {
  if (count > baseline) return 'regression';
  if (count < baseline) return 'shrink';
  return 'ok';
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('<!--')
  );
}

function hasClassUppercase(line: string): boolean {
  return /\buppercase\b/.test(line);
}

function hasTracking(line: string): boolean {
  return /\btracking-(?!normal\b)/.test(line);
}

function snippet(line: string): string {
  return line.trim().slice(0, 180);
}

function lineHits(
  source: string,
  file: string
): readonly MarketingEyebrowCapsHit[] {
  const hits: MarketingEyebrowCapsHit[] = [];
  const lines = source.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (isCommentLine(line) || !hasClassUppercase(line)) continue;
    const named = EYEBROW_NAME.test(line);
    const tracked = hasTracking(line);
    if (!named && !tracked) continue;
    hits.push({
      file,
      line: index + 1,
      kind: named ? 'named-eyebrow' : 'tracked-caps',
      text: snippet(line),
    });
  }
  return hits;
}

function enclosingRule(
  source: string,
  index: number
): { readonly selector: string; readonly body: string } | null {
  let depth = 0;
  let open = -1;
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const char = source[cursor];
    if (char === '}') depth += 1;
    else if (char === '{') {
      if (depth === 0) {
        open = cursor;
        break;
      }
      depth -= 1;
    }
  }
  if (open < 0) return null;

  depth = 0;
  let close = -1;
  for (let cursor = open; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        close = cursor;
        break;
      }
    }
  }
  if (close < 0) return null;

  let selectorStart = open;
  while (selectorStart > 0) {
    const previous = source[selectorStart - 1];
    if (previous === '}' || previous === '{') break;
    selectorStart -= 1;
  }
  return {
    selector: source.slice(selectorStart, open),
    body: source.slice(open + 1, close),
  };
}

function isTrackedCapsBody(body: string): boolean {
  if (!UPPERCASE_DECL.test(body)) return false;
  const spacing = /letter-spacing:\s*([^;]+)/.exec(body);
  if (!spacing?.[1]) return false;
  return !ZERO_TRACKING.test(spacing[1].trim());
}

function cssHits(
  source: string,
  file: string
): readonly MarketingEyebrowCapsHit[] {
  const hits: MarketingEyebrowCapsHit[] = [];
  const lines = source.split('\n');
  for (const match of source.matchAll(/text-transform:\s*uppercase/g)) {
    const index = match.index ?? 0;
    const lineNumber = source.slice(0, index).split('\n').length;
    const line = lines[lineNumber - 1] ?? '';
    if (isCommentLine(line)) continue;
    const rule = enclosingRule(source, index);
    if (!rule) continue;
    const named = EYEBROW_NAME.test(rule.selector);
    if (!named && !isTrackedCapsBody(rule.body)) continue;
    hits.push({
      file,
      line: lineNumber,
      kind: named ? 'named-eyebrow' : 'tracked-caps',
      text: snippet(line),
    });
  }
  return hits;
}

export function collectMarketingEyebrowCapsHits(
  source: string,
  file: string
): readonly MarketingEyebrowCapsHit[] {
  const normalized = file.split('\\').join('/');
  if (SKIP_FILE.test(normalized)) return [];
  if (normalized.endsWith('.css')) return cssHits(source, normalized);
  return lineHits(source, normalized);
}

function walkFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      files.push(...walkFiles(path));
      continue;
    }
    if (!SOURCE_EXT.test(entry) || SKIP_FILE.test(entry)) continue;
    files.push(path);
  }
  return files;
}

export function measureMarketingEyebrowCaps(repoRoot: string = REPO_ROOT): {
  readonly count: number;
  readonly hits: readonly MarketingEyebrowCapsHit[];
} {
  const hits: MarketingEyebrowCapsHit[] = [];
  for (const root of MARKETING_EYEBROW_CAPS_ROOTS) {
    const absolute = join(repoRoot, root);
    let stats;
    try {
      stats = statSync(absolute);
    } catch {
      continue;
    }
    if (!stats.isDirectory()) continue;
    for (const file of walkFiles(absolute)) {
      const repoRelative = relative(repoRoot, file).split('\\').join('/');
      const source = readFileSync(file, 'utf8');
      hits.push(...collectMarketingEyebrowCapsHits(source, repoRelative));
    }
  }
  hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return { count: hits.length, hits };
}
