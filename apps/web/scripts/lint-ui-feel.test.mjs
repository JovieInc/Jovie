/**
 * Unit tests for the lint-ui-feel ratchet (JOV-8197).
 *
 * The regression math (countByCheck + regressions) is pure and always runs.
 * The ESLint wiring is exercised only while eslint-rules/ui-feel.js exists —
 * before JOV-8196 lands on main the guard intentionally skips, matching the
 * script's own graceful skip.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BASELINE_KEYS,
  collectViolations,
  countByCheck,
  loadUiFeelRule,
  readBaseline,
  regressions,
} from './lint-ui-feel.mjs';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const RULE_PRESENT = existsSync(
  join(projectRoot, 'eslint-rules', 'ui-feel.js')
);

describe('ui-feel ratchet baseline math', () => {
  it('reports no regressions when counts equal the baseline', () => {
    const counts = { headingNeedsBalance: 3, missingTabularNums: 4 };
    expect(regressions(counts, counts)).toEqual([]);
  });

  it('reports no regressions when counts shrink below the baseline', () => {
    expect(
      regressions({ headingNeedsBalance: 0 }, { headingNeedsBalance: 5 })
    ).toEqual([]);
  });

  it('fails only the check that grows past its baseline', () => {
    const failures = regressions(
      {
        headingNeedsBalance: 2,
        missingTabularNums: 1,
        undersizedHitArea: 9,
      },
      {
        headingNeedsBalance: 2,
        missingTabularNums: 4,
        undersizedHitArea: 8,
      }
    );
    expect(failures).toEqual([
      { check: 'undersizedHitArea', baseline: 8, current: 9 },
    ]);
  });

  it('treats a check absent from the baseline as zero', () => {
    expect(regressions({ newCheck: 1 }, {})).toEqual([
      { check: 'newCheck', baseline: 0, current: 1 },
    ]);
  });

  it('countByCheck buckets violations by messageId', () => {
    const counts = countByCheck([
      { file: 'a.tsx', line: 1, messageId: 'missingTabularNums' },
      { file: 'a.tsx', line: 2, messageId: 'missingTabularNums' },
      { file: 'b.tsx', line: 3, messageId: 'undersizedHitArea' },
    ]);
    expect(counts.missingTabularNums).toBe(2);
    expect(counts.undersizedHitArea).toBe(1);
    expect(counts.headingNeedsBalance).toBe(0);
    expect(counts.nonConcentricRadius).toBe(0);
  });

  it('committed baseline only uses known check keys', () => {
    const baseline = readBaseline();
    for (const key of BASELINE_KEYS) {
      expect(baseline, `missing key ${key}`).toHaveProperty(key);
      expect(typeof baseline[key]).toBe('number');
    }
    for (const key of Object.keys(baseline)) {
      expect(BASELINE_KEYS).toContain(key);
    }
  });
});

describe('ui-feel rule wiring', () => {
  it.skipIf(!RULE_PRESENT)(
    'collectViolations counts the shipped rule over real sources',
    async () => {
      const rule = loadUiFeelRule();
      expect(rule).toBeTruthy();
      const violations = await collectViolations({ rule });
      expect(violations.length).toBeGreaterThan(0);
      const counts = countByCheck(violations);
      const baseline = readBaseline();
      expect(regressions(counts, baseline)).toEqual([]);
    },
    300_000
  );

  it('loadUiFeelRule tracks rule file presence', () => {
    // With the rule absent and eslint.config.js not registering it,
    // loadUiFeelRule returns null so the gate defers until JOV-8196 lands.
    expect(Boolean(loadUiFeelRule())).toBe(RULE_PRESENT);
  });
});
