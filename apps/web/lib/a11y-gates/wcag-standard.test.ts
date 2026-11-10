import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertNoLegacyWcagTags,
  assertRepositoryWcagStandard,
} from '../../scripts/a11y-wcag-standard-check.cjs';
import { STORYBOOK_A11Y_PARAMETERS, WCAG_22_AA_TAGS } from './wcag-22-aa.ts';
import {
  assertAllowlist,
  classifyRenderedTarget,
  disabledRuleIds,
  isExpired,
  legacyWcagTagCalls,
  loadAllowlist,
  wcag22AaAxeOptions,
} from './wcag-standard.cjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('WCAG 2.2 AA axe standard', () => {
  it('enables target-size in the same options object as the 2.2 tags', () => {
    const options = wcag22AaAxeOptions();
    expect(options.runOnly).toEqual({
      type: 'tag',
      values: [...WCAG_22_AA_TAGS],
    });
    expect(options.runOnly.values).toContain('wcag22aa');
    expect(options.runOnly.values).not.toContain('wcag22' + 'a');
    expect(options.rules['target-size']).toEqual({ enabled: true });
    expect(options.rules['color-contrast']).toEqual({ enabled: true });
  });

  it('rejects a disable that the allowlist does not name', () => {
    expect(() => wcag22AaAxeOptions(['button-name'])).toThrow(/button-name/);
    expect(() => wcag22AaAxeOptions(['target-size'])).toThrow(/target-size/);
  });

  it('keeps allowlisted disables and still enables target-size', () => {
    expect(disabledRuleIds('a11y-dashboard')).toEqual(['frame-tested']);
    // JOV-8781 shipped: the releases-dashboard entries are gone, so the
    // surface scans with every WCAG 2.2 AA rule armed.
    expect(disabledRuleIds('releases-dashboard')).toEqual([]);
    expect(disabledRuleIds('missing-surface')).toEqual([]);
    const options = wcag22AaAxeOptions(
      disabledRuleIds('storybook-overlay-collisions')
    );
    expect(options.rules['color-contrast']).toEqual({ enabled: false });
    expect(options.rules['target-size']).toEqual({ enabled: true });
  });

  it('expires an allowlist entry at the end of its UTC day', () => {
    expect(isExpired('2026-10-22', new Date('2026-10-22T23:59:59.999Z'))).toBe(
      false
    );
    expect(isExpired('2026-10-22', new Date('2026-10-23T00:00:00.000Z'))).toBe(
      true
    );
    const allowlist = loadAllowlist();
    const expired = structuredClone(allowlist);
    expired.entries[0].expires = '2026-10-22';
    expect(() =>
      assertAllowlist(expired, new Date('2026-10-23T00:00:00.000Z'))
    ).toThrow(/expired/);
  });

  it('fails closed when the committed allowlist grows or goes stale', () => {
    const allowlist = loadAllowlist();
    expect(allowlist.maxEntries).toBe(allowlist.entries.length);
    expect(allowlist.entries.length).toBe(2);
    let mainText: string | null = null;
    try {
      mainText = execFileSync(
        'git',
        ['show', 'origin/main:apps/web/lib/a11y-gates/a11y-allowlist.json'],
        { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      );
    } catch {
      mainText = null;
    }
    if (mainText != null) {
      const main = JSON.parse(mainText) as { entries: unknown[] };
      expect(allowlist.entries.length).toBeLessThanOrEqual(main.entries.length);
    }
    assertRepositoryWcagStandard();
  });

  it('detects a raw WCAG withTags call and ignores best-practice', () => {
    const legacy = `.${'withTags'}(['wcag2a', 'wcag2aa'])`;
    const practice = `.${'withTags'}(['best-practice'])`;
    expect(legacyWcagTagCalls(legacy)).toHaveLength(1);
    expect(legacyWcagTagCalls(practice)).toEqual([]);
    assertNoLegacyWcagTags();
  });

  it('classifies rendered boxes against the 24px WCAG 2.2 target', () => {
    expect(classifyRenderedTarget({ width: 0, height: 48 })).toBe('hidden');
    expect(classifyRenderedTarget({ width: 16, height: 16 })).toBe(
      'undersized'
    );
    expect(classifyRenderedTarget({ width: 24, height: 24 })).toBe('ok');
    expect(classifyRenderedTarget({ width: 48, height: 23.9 })).toBe(
      'undersized'
    );
  });

  it('fails Storybook stories unless the addon is in error mode', () => {
    expect(STORYBOOK_A11Y_PARAMETERS.test).toBe('error');
    expect(STORYBOOK_A11Y_PARAMETERS.config.rules.map(rule => rule.id)).toEqual(
      ['color-contrast', 'target-size']
    );
  });
});
