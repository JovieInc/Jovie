/**
 * One accent per marketing section.
 *
 * A section is a marketing source file that renders `<section`, `sectionId`,
 * or MarketingSectionFrame. It must use exactly one Scene Palette role
 * (ion #3FAFF3 / #11AFFF, ultra #A789F0 / #8E56F5, pulse #EB6AC6 / #F52BB5).
 * Any other hex that is not already a design token is a hardcoded color.
 * Pre-existing misses live in the baseline and can only shrink.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectAccentSignals, collectHexes, normalizeHex } from './color.mjs';
import {
  MARKETING_SOURCE_ROOTS,
  REPO_ROOT,
  relPath,
  stripComments,
  TOKEN_HEX_SOURCES,
  walkFiles,
} from './paths.mjs';
import { ancestorJson, evaluateRatchet } from './ratchet.mjs';

export const ACCENT_BASELINE =
  'scripts/invariants/art-direction/accent.baseline.json';

const SECTION = /<section\b|sectionId\s*=|MarketingSectionFrame\b/;

function tokenHexes(repoRoot) {
  const allowed = new Set();
  for (const rel of TOKEN_HEX_SOURCES) {
    let source;
    try {
      source = readFileSync(join(repoRoot, rel), 'utf8');
    } catch {
      continue;
    }
    for (const hex of collectHexes(source)) {
      const normalized = normalizeHex(hex);
      if (normalized) allowed.add(normalized);
    }
  }
  return allowed;
}

export function accentViolations(source, file, allowed) {
  const text = stripComments(source);
  const section = file.endsWith('.tsx') || file.endsWith('.jsx');
  /** @type {string[]} */
  const ids = [];
  if (section && SECTION.test(text)) {
    const { roles } = collectAccentSignals(text);
    if (roles.length === 0) ids.push(`missing-accent:${file}`);
    if (roles.length > 1) ids.push(`multi-accent:${file}:${roles.join('+')}`);
  }
  if (!section && !file.endsWith('.css')) return ids;
  const seen = new Set();
  for (const hex of collectHexes(text)) {
    const normalized = normalizeHex(hex);
    if (!normalized || allowed.has(normalized) || seen.has(normalized))
      continue;
    seen.add(normalized);
    ids.push(`hardcoded-hex:${file}:${normalized}`);
  }
  return ids;
}

export function scanAccent(repoRoot = REPO_ROOT) {
  const allowed = tokenHexes(repoRoot);
  /** @type {string[]} */
  const ids = [];
  for (const file of walkFiles(repoRoot, MARKETING_SOURCE_ROOTS)) {
    const rel = relPath(repoRoot, file);
    const source = readFileSync(file, 'utf8');
    ids.push(...accentViolations(source, rel, allowed));
  }
  ids.sort();
  return ids;
}

export const check = checkAccent;

export function checkAccent(repoRoot = REPO_ROOT, recordedIds) {
  const current = scanAccent(repoRoot);
  const recorded =
    recordedIds ??
    JSON.parse(readFileSync(join(repoRoot, ACCENT_BASELINE), 'utf8')).ids;
  const ancestor = ancestorJson(repoRoot, ACCENT_BASELINE);
  if (!ancestor.ok) return { failures: [ancestor.error], ids: current };
  const ancestorIds = ancestor.ancestor?.ids ?? null;
  return {
    failures: evaluateRatchet({
      current,
      recorded,
      ancestor: ancestorIds,
    }),
    ids: current,
  };
}
