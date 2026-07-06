/**
 * Touch-target scan engine (JOV #12012, WCAG 2.5.5 / Apple HIG 44pt).
 *
 * Static JSX lint: finds interactive elements (`<button>`, `<a>`,
 * role="button") declaring explicit sub-44px height utilities
 * (`h-4`…`h-10`, `size-4`…`size-10`, `h-[Npx]` with N < 44) that are not
 * rescued by a ≥44px height/min-height utility on the same element.
 *
 * Consumed by:
 *   - scripts/lint-touch-target.ts (CLI ratchet)
 *   - tests/unit/design-system/touch-target-ratchet.test.ts (merge gate)
 */

import type { Dirent } from 'node:fs';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface TouchTargetViolation {
  readonly file: string;
  readonly line: number;
  readonly tag: string;
}

export const SCAN_DIRS = ['components', 'app'] as const;
const EXTENSIONS = ['.tsx'];
const SKIP_FRAGMENTS = ['.stories.', '.spec.', '.test.', '.storybook/'];

// Tailwind heights below 44px (h-11 = 2.75rem = 44px is the floor).
const SUB_44_SCALE =
  '(?:0|0\\.5|1|1\\.5|2|2\\.5|3|3\\.5|4|4\\.5|5|5\\.5|6|6\\.5|7|7\\.5|8|8\\.5|9|9\\.5|10|10\\.5)';
const SUB_44_UTILITY = new RegExp(
  `(?:^|[\\s"'\`])(?:h|size)-${SUB_44_SCALE}(?:$|[\\s"'\`])`
);
const SUB_44_ARBITRARY = /(?:^|[\s"'`])(?:h|size)-\[(\d+(?:\.\d+)?)px\]/;

// A ≥44px height/min-height utility rescues the element.
const RESCUE_SCALE =
  '(?:11|12|13|14|15|16|20|24|28|32|36|40|44|48|52|56|60|64|72|80|96|full|screen)';
const RESCUE_UTILITY = new RegExp(
  `(?:^|[\\s"'\`])(?:h|size|min-h)-${RESCUE_SCALE}(?:$|[\\s"'\`])`
);
const RESCUE_ARBITRARY = /(?:^|[\s"'`])(?:h|size|min-h)-\[(\d+(?:\.\d+)?)px\]/g;

const INTERACTIVE_OPENING =
  /<(?:button|a)(?=[\s/>])|role\s*=\s*["']button["']/g;

// ── file walking ────────────────────────────────────────────────────────────

export function walkDir(dir: string, files: string[] = []): string[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (
      entry.name.startsWith('.') ||
      entry.name === 'node_modules' ||
      entry.name === '.next'
    ) {
      continue;
    }
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, files);
    } else if (
      EXTENSIONS.some(ext => entry.name.endsWith(ext)) &&
      !SKIP_FRAGMENTS.some(f => fullPath.includes(f))
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

// ── JSX opening-tag extraction ──────────────────────────────────────────────

/**
 * Given source text and the index of an interactive-element match, return
 * the full opening-tag text up to the matching `>` at brace/quote depth 0.
 * Best-effort but deterministic.
 */
export function extractOpeningTag(
  source: string,
  startIndex: number
): string | null {
  // Walk back to the enclosing `<` when we matched on role="button".
  let start = startIndex;
  if (source[start] !== '<') {
    start = source.lastIndexOf('<', startIndex);
    if (start === -1) return null;
  }
  let i = start;
  let brace = 0;
  let quote: string | null = null;
  const limit = Math.min(source.length, start + 4000);
  while (i < limit) {
    const ch = source[i];
    if (quote) {
      if (ch === quote && source[i - 1] !== '\\') quote = null;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
    } else if (ch === '{') {
      brace += 1;
    } else if (ch === '}') {
      brace -= 1;
    } else if (ch === '>' && brace === 0) {
      return source.slice(start, i + 1);
    }
    i += 1;
  }
  return null;
}

// ── violation detection ─────────────────────────────────────────────────────

export function tagHasSub44Height(tagText: string): boolean {
  let hasSub44 = SUB_44_UTILITY.test(tagText);
  if (!hasSub44) {
    const arb = tagText.match(SUB_44_ARBITRARY);
    if (arb && Number.parseFloat(arb[1]) < 44) hasSub44 = true;
  }
  if (!hasSub44) return false;

  // Rescued by an explicit ≥44px height/min-height on the same element?
  if (RESCUE_UTILITY.test(tagText)) return false;
  for (const m of tagText.matchAll(RESCUE_ARBITRARY)) {
    if (Number.parseFloat(m[1]) >= 44) return false;
  }
  return true;
}

export function findViolationsInSource(
  source: string,
  filePath = '<inline>'
): TouchTargetViolation[] {
  const violations: TouchTargetViolation[] = [];
  const seenTagStarts = new Set<number>();
  for (const match of source.matchAll(INTERACTIVE_OPENING)) {
    if (match.index === undefined) continue;
    const tag = extractOpeningTag(source, match.index);
    if (!tag) continue;
    const tagStart = source.indexOf(tag, Math.max(0, match.index - 4000));
    if (seenTagStarts.has(tagStart)) continue;
    seenTagStarts.add(tagStart);
    if (tagHasSub44Height(tag)) {
      const line = source.slice(0, match.index).split('\n').length;
      violations.push({ file: filePath, line, tag: tag.slice(0, 120) });
    }
  }
  return violations;
}

export function countViolations(scanRoot: string): TouchTargetViolation[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) walkDir(join(scanRoot, dir), files);
  const violations: TouchTargetViolation[] = [];
  for (const filePath of files) {
    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    violations.push(...findViolationsInSource(content, filePath));
  }
  return violations;
}
