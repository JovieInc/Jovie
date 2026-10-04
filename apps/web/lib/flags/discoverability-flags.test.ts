import { describe, expect, it } from 'vitest';
import {
  DISCOVERABILITY_FLAGS,
  isDiscoverabilityFlagEnabled,
} from './discoverability-flags';

describe('discoverability flags', () => {
  it('keeps unapproved workspace doors off when the snapshot is missing', () => {
    for (const name of ['YOUTUBE_WORKSPACE_NAV', 'JOVIE_WORK_NAV'] as const) {
      expect(DISCOVERABILITY_FLAGS[name]).toBe(false);
      expect(isDiscoverabilityFlagEnabled(name)).toBe(false);
      expect(isDiscoverabilityFlagEnabled(name, {})).toBe(false);
    }
  });
  it('uses the resolved snapshot for both enabled and disabled states', () => {
    for (const name of ['YOUTUBE_WORKSPACE_NAV', 'JOVIE_WORK_NAV'] as const) {
      expect(isDiscoverabilityFlagEnabled(name, { [name]: true })).toBe(true);
      expect(isDiscoverabilityFlagEnabled(name, { [name]: false })).toBe(false);
    }
  });
});
