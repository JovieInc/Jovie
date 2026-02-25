import { describe, expect, it } from 'vitest';
import {
  getOnboardingDashboardInitialQuery,
  type SpotifyImportStatus,
} from '@/components/dashboard/organisms/apple-style-onboarding/onboardingDashboardQuery';

describe('getOnboardingDashboardInitialQuery', () => {
  it('returns a latest releases prompt when spotify import succeeded', () => {
    expect(getOnboardingDashboardInitialQuery('success')).toBe(
      'Show me my latest releases'
    );
  });

  it.each<SpotifyImportStatus>([
    'idle',
    'importing',
    'error',
  ])('returns a connect spotify prompt when status is %s', status => {
    expect(getOnboardingDashboardInitialQuery(status)).toBe(
      'Connect my Spotify'
    );
  });
});
