import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { boundaryMock, pageMock, trackMock } = vi.hoisted(() => ({
  boundaryMock: vi.fn(),
  pageMock: vi.fn(),
  trackMock: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({
  page: (...args: unknown[]) => pageMock(...args),
  track: (...args: unknown[]) => trackMock(...args),
}));

vi.mock(
  '@/components/features/onboarding/OnboardingSessionBoundary',
  async () => {
    const reactModule = await import('react');
    return {
      OnboardingSessionBoundary: (props: Record<string, unknown>) => {
        boundaryMock(props);
        return reactModule.createElement('div', {
          'data-testid': 'onboarding-session-boundary',
        });
      },
    };
  }
);

import { WAITLIST_FRONT_DOOR_VARIANT_ID } from '@/data/homepageFrontDoorCta';
import { WaitlistPublicLanding } from './WaitlistPublicLanding';

describe('WaitlistPublicLanding', () => {
  it('renders the existing conversation boundary as the chat-first waitlist entry', () => {
    render(
      <WaitlistPublicLanding
        signInHref='/signin?redirect_url=%2Fwaitlist'
        starterHandoff={{ kind: 'prompt', prompt: 'Help with my release' }}
      />
    );

    expect(boundaryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entrySurface: 'waitlist',
        sessionLabel: 'pending',
        signInHref: '/signin?redirect_url=%2Fwaitlist',
        starterHandoff: { kind: 'prompt', prompt: 'Help with my release' },
      })
    );
    expect(screen.getByTestId('onboarding-session-boundary')).toBeVisible();
    expect(pageMock).toHaveBeenCalledWith(
      'waitlist',
      expect.objectContaining({
        variantIdentity: WAITLIST_FRONT_DOOR_VARIANT_ID,
      })
    );
    expect(trackMock).toHaveBeenCalledWith(
      'waitlist_front_door_viewed',
      expect.objectContaining({
        variantIdentity: WAITLIST_FRONT_DOOR_VARIANT_ID,
      })
    );
    expect(trackMock).toHaveBeenCalledWith(
      'waitlist_front_door_cta_exposed',
      expect.objectContaining({
        variantIdentity: WAITLIST_FRONT_DOOR_VARIANT_ID,
      })
    );
  });
});
