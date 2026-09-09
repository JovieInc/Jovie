import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Deprecated Button alias ratchet (JOV-5601).
 *
 * `packages/ui/atoms/button-contract.ts` still normalizes legacy variant
 * aliases (`outline`, `whitePill`, `frosted`, …) onto the canonical Button
 * variants for migration compatibility. Live app callsites should name the
 * canonical variant directly so one CTA language survives. This ratchet
 * counts `variant='<alias>'` selections across the web surfaces; the count
 * may only go DOWN. When you retire aliases, lower `count` in
 * deprecated-button-alias.baseline.json in the SAME PR.
 *
 * Sibling of raw-button-ratchet.test.ts — same committed-baseline shape.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
// tests/unit/design-system → apps/web
const WEB_ROOT = join(__dirname, '..', '..', '..');
const SCAN_DIRS = ['components', 'app'].map(d => join(WEB_ROOT, d));
const BASELINE_PATH = join(__dirname, 'deprecated-button-alias.baseline.json');

// Mirrors DeprecatedButtonVariant in packages/ui/atoms/button-contract.ts.
export const DEPRECATED_BUTTON_VARIANT_ALIASES = [
  'accent',
  'outline',
  'destructive',
  'frosted',
  'frosted-ghost',
  'frosted-outline',
  'whitePill',
] as const;

const ALIAS_SELECTION = new RegExp(
  `\\bvariant=(?:'|")(?:${DEPRECATED_BUTTON_VARIANT_ALIASES.join('|')})(?:'|")`,
  'g'
);
const SOURCE_EXT = /\.(tsx|ts)$/;

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (
        entry === 'node_modules' ||
        entry === '.next' ||
        entry === '__tests__'
      ) {
        continue;
      }
      walk(full, out);
    } else if (
      SOURCE_EXT.test(entry) &&
      !/\.(test|stories)\.[tj]sx?$/.test(entry) &&
      !full.includes(`${sep}__tests__${sep}`)
    ) {
      out.push(full);
    }
  }
}

interface AliasCount {
  readonly total: number;
  readonly byFile: ReadonlyMap<string, number>;
}

export function countDeprecatedAliasSelections(
  roots: readonly string[] = SCAN_DIRS
): AliasCount {
  const files: string[] = [];
  for (const dir of roots) walk(dir, files);
  const byFile = new Map<string, number>();
  let total = 0;
  for (const file of files) {
    const matches = readFileSync(file, 'utf8').match(ALIAS_SELECTION);
    if (!matches) continue;
    total += matches.length;
    byFile.set(relative(WEB_ROOT, file), matches.length);
  }
  return { total, byFile };
}

describe('deprecated Button alias ratchet', () => {
  it('matches every alias the Button contract still normalizes', () => {
    const contract = readFileSync(
      join(
        WEB_ROOT,
        '..',
        '..',
        'packages',
        'ui',
        'atoms',
        'button-contract.ts'
      ),
      'utf8'
    );
    for (const alias of DEPRECATED_BUTTON_VARIANT_ALIASES) {
      expect(
        contract,
        `${alias} missing from DeprecatedButtonVariant`
      ).toContain(`'${alias}'`);
    }
  });

  it('detects a deliberate deprecated alias selection', () => {
    expect(
      "<Button variant='whitePill' className='px-4'>Go</Button>".match(
        ALIAS_SELECTION
      )
    ).toHaveLength(1);
    expect(
      "<Button variant='primary' size='marketing'>Go</Button>".match(
        ALIAS_SELECTION
      )
    ).toBeNull();
  });

  it('never grows the live deprecated-alias count above the baseline', () => {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as {
      count: number;
    };
    const { total, byFile } = countDeprecatedAliasSelections();
    const top = [...byFile.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([file, n]) => `${file} (${n})`)
      .join(', ');
    expect(
      total,
      `Deprecated Button alias selections grew (${total} > ${baseline.count}). Name the canonical variant instead (outline→secondary, whitePill/accent/destructive→primary, frosted→secondary, frosted-ghost→ghost). Heaviest files: ${top}`
    ).toBeLessThanOrEqual(baseline.count);
  });
});
