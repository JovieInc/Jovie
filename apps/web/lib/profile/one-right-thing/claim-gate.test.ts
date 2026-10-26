import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { countPersonalizingRules, ONE_RIGHT_THING_CLAIM_GATE } from './engine';

/**
 * Claim gate for "Jovie shows each person the right thing" (Tim, 2026-10-25).
 *
 * Marketing copy may make that claim only when the engine is wired into the
 * live public profile and at least `minLiveRules` rules personalize. Flip
 * `ONE_RIGHT_THING_LIVE_ON_PROFILE` in the PR that wires the engine in.
 */
export const ONE_RIGHT_THING_LIVE_ON_PROFILE = false;

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const SCAN_DIRS = [
  'app/(home)',
  'app/(marketing)',
  'data',
  'components/marketing',
];

/** The gated claim itself. */
const GATED_CLAIM =
  /shows? (each|every) (person|visitor|fan) the right (thing|next step)|one right thing/iu;

/**
 * Looser personalization wording that already shipped before the engine
 * existed. These are a ratchet: no new entries, and each is removed or kept
 * only because it describes routing that is true today (listening links) or
 * is aspirational copy tracked for rewording. Adding a line here needs the
 * same review as adding a claim.
 */
const LEGACY_PERSONALIZATION_PHRASES: ReadonlyArray<readonly [string, string]> =
  [
    ['app/(marketing)/ai/page.tsx', 'next best action'],
    ['app/(marketing)/launch/page.tsx', 'right listening destination'],
    ['app/(marketing)/smart-links/page.tsx', 'where each visitor listens'],
    ['data/artistProfileCopy.ts', 'adapts to every fan'],
  ];

const PERSONALIZATION_PATTERN =
  /next best action|right listening destination|where each visitor listens|next step that fits|adapts to every fan/giu;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (name === 'node_modules' || name === '__tests__') continue;
      walk(full, out);
    } else if (
      /\.(tsx?|md)$/u.test(name) &&
      !/\.(test|stories|spec)\./u.test(name)
    ) {
      out.push(full);
    }
  }
  return out;
}

const files = SCAN_DIRS.flatMap(dir => {
  try {
    return walk(join(WEB_ROOT, dir));
  } catch {
    return [];
  }
}).map(file => ({
  path: relative(WEB_ROOT, file),
  text: readFileSync(file, 'utf8'),
}));

describe('one-right-thing claim gate', () => {
  it('the gated claim appears only once the engine is live with enough rules', () => {
    const engineBackedClaim =
      ONE_RIGHT_THING_LIVE_ON_PROFILE &&
      countPersonalizingRules() >= ONE_RIGHT_THING_CLAIM_GATE.minLiveRules;
    const offenders = files
      .filter(file => GATED_CLAIM.test(file.text))
      .map(file => file.path);
    if (!engineBackedClaim) expect(offenders).toEqual([]);
  });

  it('does not add personalization wording beyond the legacy ratchet', () => {
    const found: string[] = [];
    for (const file of files) {
      for (const match of file.text.matchAll(PERSONALIZATION_PATTERN)) {
        found.push(`${file.path}::${match[0].toLowerCase()}`);
      }
    }
    const allowed = LEGACY_PERSONALIZATION_PHRASES.map(
      ([path, phrase]) => `${path}::${phrase.toLowerCase()}`
    );
    const unexpected = found.filter(entry => !allowed.includes(entry));
    expect(unexpected).toEqual([]);
  });

  it('keeps the legacy list honest: every entry still exists in its file', () => {
    for (const [path, phrase] of LEGACY_PERSONALIZATION_PHRASES) {
      const file = files.find(f => f.path === path);
      expect(file, `${path} should be scanned`).toBeDefined();
      expect(file?.text.toLowerCase()).toContain(phrase.toLowerCase());
    }
  });
});
