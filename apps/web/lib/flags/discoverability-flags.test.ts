import { afterEach, describe, expect, it } from 'vitest';
import {
  DISCOVERABILITY_FLAGS,
  isDiscoverabilityFlagEnabled,
} from './discoverability-flags';

describe('discoverability flags', () => {
  afterEach(() => {
    delete process.env.FEATURE_YOUTUBE_WORKSPACE_NAV;
    delete process.env.FEATURE_JOVIE_WORK_NAV;
  });

  it('keeps unapproved workspace doors off', () => {
    expect(DISCOVERABILITY_FLAGS.YOUTUBE_WORKSPACE_NAV).toBe(false);
    expect(DISCOVERABILITY_FLAGS.JOVIE_WORK_NAV).toBe(false);
    expect(isDiscoverabilityFlagEnabled('YOUTUBE_WORKSPACE_NAV')).toBe(false);
    expect(isDiscoverabilityFlagEnabled('JOVIE_WORK_NAV')).toBe(false);
  });

  it('honors FEATURE_<FLAG_NAME> env overrides', () => {
    process.env.FEATURE_YOUTUBE_WORKSPACE_NAV = 'true';
    expect(isDiscoverabilityFlagEnabled('YOUTUBE_WORKSPACE_NAV')).toBe(true);
    process.env.FEATURE_JOVIE_WORK_NAV = 'false';
    expect(isDiscoverabilityFlagEnabled('JOVIE_WORK_NAV')).toBe(false);
  });
});
