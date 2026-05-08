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
  APP_FLAG_DEFAULTS,
  APP_FLAG_TO_STATSIG_GATE,
  LOCAL_DEFAULT_ONLY_FLAGS,
} from '@/lib/flags/contracts';

describe('flag registration guardrail', () => {
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
