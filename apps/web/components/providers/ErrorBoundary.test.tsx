import { describe, expect, it, vi } from 'vitest';
import { trackingEligibility } from '@/lib/tracking/eligibility';
import { ErrorBoundary } from './ErrorBoundary';

const state = vi.hoisted(() => ({ youngAudience: false }));
vi.mock('@/lib/tracking/use-tracking-eligibility', () => ({
  getBrowserTrackingEligibility: () =>
    trackingEligibility({ profile: state, visitor: {} }),
}));
vi.mock('@/lib/analytics/signup-funnel-client', () => ({
  forwardAnalyticsEventToFunnel: vi.fn(),
}));
vi.mock('@/lib/errors/capture', () => ({
  captureErrorInSentry: vi.fn(),
  isUserFacingError: () => false,
}));
describe('error analytics privacy', () => {
  it.each([false, true])(
    'gates the actual GA transport when youngAudience=%s',
    youngAudience => {
      state.youngAudience = youngAudience;
      const gtag = vi.fn();
      vi.stubGlobal('gtag', gtag);
      new ErrorBoundary({ children: null }).componentDidCatch(
        new Error('synthetic'),
        { componentStack: '' }
      );
      expect(gtag).toHaveBeenCalledTimes(youngAudience ? 0 : 1);
      vi.unstubAllGlobals();
    }
  );
});
