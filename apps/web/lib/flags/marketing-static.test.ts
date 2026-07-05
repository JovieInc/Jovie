import { describe, expect, it } from 'vitest';
import { FEATURE_FLAGS } from './marketing-static';

/**
 * Guardrail for the 2026-06-22 homepage regression (#11484, fixed in the PR that
 * adds this test). The `*_V1_DESIGN` flags have INVERTED semantics: `true` renders
 * the OLD design. A blanket "default all flags on" change flipped them to `true`,
 * silently reverting the homepage to `HomeV1Design` and bypassing the V2 hero +
 * sections — caught only by the post-deploy synthetic monitor, ~36h late.
 *
 * These assertions run in the gated unit suite, so any accidental re-flip fails on
 * the PR instead of in production. If V1 is ever intended again, that's a
 * deliberate product decision — update these assertions in the same PR.
 */
describe('marketing-static homepage design flags', () => {
  it('renders the V2 homepage (SHOW_HOME_V1_DESIGN must stay false)', () => {
    expect(FEATURE_FLAGS.SHOW_HOME_V1_DESIGN).toBe(false);
  });

  it('renders the V2 public profile (SHOW_PUBLIC_PROFILE_V1_DESIGN must stay false)', () => {
    expect(FEATURE_FLAGS.SHOW_PUBLIC_PROFILE_V1_DESIGN).toBe(false);
  });
});
