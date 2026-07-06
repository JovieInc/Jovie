import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractRules } from '../../../lib/a11y-gates/contrast-engine';

/**
 * Reduced-motion token guard (JOV #12012).
 *
 * Every motion-duration token that is defined with a literal nonzero time
 * (`220ms`, `.35s`, …) MUST be re-declared as `0ms`/`0s` inside a
 * `@media (prefers-reduced-motion: reduce)` block in the same file.
 * Tokens that alias another token (`var(--…)`) inherit the zeroing of their
 * source and are exempt.
 *
 * This closes the class of bug where the reduced-motion block zeroes
 * `--ds-motion-*` but a raw scale (`--duration-fast`, `--motion-reveal-*`,
 * `--clerk-motion-duration`) bypasses it: adding a NEW duration token
 * without wiring it into the reduced-motion block fails this test.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, '..', '..', '..');

const CSS_FILES = [
  join(WEB_ROOT, 'styles', 'design-system.css'),
  join(WEB_ROOT, 'app', 'globals.css'),
  join(WEB_ROOT, 'styles', 'theme.css'),
  join(WEB_ROOT, 'styles', 'linear-tokens.css'),
];

/** Token names that represent a motion duration. */
const DURATION_TOKEN = /^--(?:[\w-]*-)?(?:duration|speed)(?:-[\w-]*)?$/;
const isDurationToken = (name: string) =>
  DURATION_TOKEN.test(name) &&
  // transition-duration-* theme entries alias --duration-* (already zeroed)
  !name.startsWith('--transition-duration-');

const LITERAL_TIME = /^\d*\.?\d+m?s$/;
const ZERO_TIME = /^0(?:\.0+)?m?s$/;
const REDUCED_MOTION = /prefers-reduced-motion\s*:\s*reduce/;

interface TokenRecord {
  file: string;
  name: string;
  value: string;
}

function collectDurationTokens() {
  const literalTokens: TokenRecord[] = [];
  const zeroedByFile = new Map<string, Set<string>>();

  for (const file of CSS_FILES) {
    const css = readFileSync(file, 'utf8');
    const zeroed = new Set<string>();
    for (const rule of extractRules(css)) {
      const inReducedMotion = REDUCED_MOTION.test(rule.atContext);
      for (const [name, value] of rule.declarations) {
        if (!isDurationToken(name)) continue;
        if (inReducedMotion) {
          if (ZERO_TIME.test(value.trim())) zeroed.add(name);
        } else if (
          LITERAL_TIME.test(value.trim()) &&
          !ZERO_TIME.test(value.trim())
        ) {
          literalTokens.push({ file, name, value: value.trim() });
        }
      }
    }
    zeroedByFile.set(file, zeroed);
  }

  return { literalTokens, zeroedByFile };
}

describe('reduced-motion zeroes ALL duration tokens', () => {
  const { literalTokens, zeroedByFile } = collectDurationTokens();

  it('finds the known duration token scales (sanity: parser is not silently broken)', () => {
    const names = new Set(literalTokens.map(t => t.name));
    expect(names.has('--duration-fast')).toBe(true);
    expect(names.has('--duration-normal')).toBe(true);
    expect(names.has('--ds-motion-subtle-duration')).toBe(true);
    expect(names.has('--motion-reveal-duration')).toBe(true);
    expect(names.has('--clerk-motion-duration')).toBe(true);
  });

  it('every literal duration token is zeroed under prefers-reduced-motion in its file', () => {
    const unzeroed = literalTokens.filter(
      t => !zeroedByFile.get(t.file)?.has(t.name)
    );
    const report = unzeroed
      .map(
        t => `${t.name}: ${t.value} (${t.file.replace(WEB_ROOT, 'apps/web')})`
      )
      .join('\n');
    expect(
      unzeroed,
      `Duration tokens NOT zeroed under @media (prefers-reduced-motion: reduce):\n${report}\n` +
        'Add each token with value 0ms to the reduced-motion block of the same file.'
    ).toHaveLength(0);
  });

  it('the raw --duration-* scale is explicitly zeroed (regression guard for the original bug)', () => {
    const designSystemZeroed = zeroedByFile.get(CSS_FILES[0]);
    for (const token of [
      '--duration-instant',
      '--duration-fast',
      '--duration-normal',
      '--duration-slow',
      '--duration-slower',
      '--duration-slowest',
      '--ds-motion-subtle-duration',
      '--ds-motion-cinematic-duration',
    ]) {
      expect(
        designSystemZeroed?.has(token),
        `${token} must be zeroed in design-system.css reduced-motion block`
      ).toBe(true);
    }
  });
});
