/**
 * Flag Registration Guardrail
 *
 * Shame-on-me clause: chat_jank_monitor shipped without a Statsig gate mapping,
 * silently using local default (false) and firing zero events in production for two weeks.
 * This test would have caught that. It MUST run on every PR. (See JOV-1972)
 *
 * Invariant: every flag in APP_FLAG_DEFAULTS must either
 *   (a) have a corresponding entry in APP_FLAG_TO_STATSIG_GATE, or
 *   (b) be listed in LOCAL_DEFAULT_ONLY_FLAGS with a justification comment.
 *
 * If this test fails, you must either:
 *   - Add a Statsig gate mapping for the flag in APP_FLAG_TO_STATSIG_GATE, or
 *   - Add the flag to LOCAL_DEFAULT_ONLY_FLAGS in contracts.ts with an inline
 *     comment explaining why it intentionally has no remote gate.
 */

import { describe, expect, it } from 'vitest';

import {
  APP_FLAG_AUDIT_OWNER,
  APP_FLAG_AUDIT_REGISTRY,
  APP_FLAG_DEFAULTS,
  APP_FLAG_OVERRIDE_KEYS,
  APP_FLAG_TO_STATSIG_GATE,
  LOCAL_DEFAULT_ONLY_FLAGS,
} from '@/lib/flags/contracts';
import { applyAppFlagOverrides } from '@/lib/flags/overrides';

describe('flag registration guardrail', () => {
  it('requires complete lifecycle and certification metadata for every active flag', () => {
    expect(Object.keys(APP_FLAG_AUDIT_REGISTRY).sort()).toEqual(
      Object.keys(APP_FLAG_DEFAULTS).sort()
    );

    for (const [flagName, defaultValue] of Object.entries(APP_FLAG_DEFAULTS)) {
      const audit =
        APP_FLAG_AUDIT_REGISTRY[
          flagName as keyof typeof APP_FLAG_AUDIT_REGISTRY
        ];

      expect(audit.owner, `${flagName} must have an owner`).toBe(
        APP_FLAG_AUDIT_OWNER
      );
      expect(audit.purpose.trim(), `${flagName} must have a purpose`).not.toBe(
        ''
      );
      expect(audit.safeDefault, `${flagName} safe default drifted`).toBe(
        defaultValue
      );
      expect(audit.targeting).toBe('dev_staging_prod_override');
      expect(
        audit.removalCondition.trim(),
        `${flagName} must have a removal condition`
      ).not.toBe('');
      expect(audit.schemaAssumption).toBe('feature_flag_overrides_optional');
      expect(audit.killSwitch).toEqual({
        disabledValue: false,
        activationBoundary: 'next_flag_resolution_after_audited_write',
      });
      expect(audit.certificationStates).toEqual(['off', 'on']);
    }
  });

  it('certifies both kill-switch states for every active flag', () => {
    for (const flagName of Object.keys(
      APP_FLAG_DEFAULTS
    ) as (keyof typeof APP_FLAG_DEFAULTS)[]) {
      const overrideKey = APP_FLAG_OVERRIDE_KEYS[flagName];

      expect(
        applyAppFlagOverrides(APP_FLAG_DEFAULTS, { [overrideKey]: false })[
          flagName
        ],
        `${flagName} must resolve its disabled state`
      ).toBe(false);
      expect(
        applyAppFlagOverrides(APP_FLAG_DEFAULTS, { [overrideKey]: true })[
          flagName
        ],
        `${flagName} must resolve its enabled state`
      ).toBe(true);
    }
  });

  it('every flag in APP_FLAG_DEFAULTS is either Statsig-mapped or explicitly exempted', () => {
    const statsigMapped = new Set(Object.keys(APP_FLAG_TO_STATSIG_GATE));
    const allFlags = Object.keys(
      APP_FLAG_DEFAULTS
    ) as (keyof typeof APP_FLAG_DEFAULTS)[];

    const unregisteredFlags = allFlags.filter(
      flag => !statsigMapped.has(flag) && !LOCAL_DEFAULT_ONLY_FLAGS.has(flag)
    );

    expect(
      unregisteredFlags,
      [
        '',
        'FLAG REGISTRATION GUARDRAIL FAILURE',
        `The following flags exist in APP_FLAG_DEFAULTS but have no Statsig gate`,
        `mapping AND are not listed in LOCAL_DEFAULT_ONLY_FLAGS:`,
        '',
        `  ${unregisteredFlags.join(', ')}`,
        '',
        `To fix, either:`,
        `  1. Add a Statsig gate key for each flag in APP_FLAG_TO_STATSIG_GATE in`,
        `     apps/web/lib/flags/contracts.ts`,
        `  2. Or add the flag to LOCAL_DEFAULT_ONLY_FLAGS in the same file with an`,
        `     inline comment explaining why it intentionally has no remote gate.`,
        '',
        `See JOV-1972 for background on this guardrail.`,
      ].join('\n')
    ).toEqual([]);
  });

  it('LOCAL_DEFAULT_ONLY_FLAGS only contains flags that exist in APP_FLAG_DEFAULTS', () => {
    const allFlags = new Set(Object.keys(APP_FLAG_DEFAULTS));

    const phantomFlags: string[] = [];
    for (const flag of LOCAL_DEFAULT_ONLY_FLAGS) {
      if (!allFlags.has(flag)) {
        phantomFlags.push(flag);
      }
    }

    expect(
      phantomFlags,
      [
        '',
        'LOCAL_DEFAULT_ONLY_FLAGS STALE ENTRY',
        `The following flags are listed in LOCAL_DEFAULT_ONLY_FLAGS but do not`,
        `exist in APP_FLAG_DEFAULTS (they may have been removed or renamed):`,
        '',
        `  ${phantomFlags.join(', ')}`,
        '',
        `Remove the stale entries from LOCAL_DEFAULT_ONLY_FLAGS in`,
        `apps/web/lib/flags/contracts.ts`,
      ].join('\n')
    ).toEqual([]);
  });
});
