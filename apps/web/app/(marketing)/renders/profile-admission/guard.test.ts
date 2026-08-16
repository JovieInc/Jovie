import { describe, expect, it } from 'vitest';
import {
  isProfileAdmissionFixtureEnabled,
  PROFILE_ADMISSION_FIXTURE_METADATA,
} from './guard';

describe('profile admission fixture guard', () => {
  it('only enables the route in the explicit test E2E runtime', () => {
    expect(
      isProfileAdmissionFixtureEnabled({
        NODE_ENV: 'test',
        NEXT_PUBLIC_E2E_MODE: '1',
      })
    ).toBe(true);
    expect(
      isProfileAdmissionFixtureEnabled({
        NODE_ENV: 'production',
        NEXT_PUBLIC_E2E_MODE: '1',
      })
    ).toBe(false);
    expect(
      isProfileAdmissionFixtureEnabled({
        NODE_ENV: 'test',
        NEXT_PUBLIC_E2E_MODE: undefined,
      })
    ).toBe(false);
  });

  it('is defensively excluded from indexing and crawling', () => {
    expect(PROFILE_ADMISSION_FIXTURE_METADATA.robots).toEqual({
      index: false,
      follow: false,
    });
  });
});
