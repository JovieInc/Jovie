/**
 * JOV-8068: a returning signed-in visitor on /start must never be auto-claimed
 * or navigated to checkout/waitlist — not on mount, and not after a completed
 * turn. The claim handoff surfaces as an inline card and navigation happens
 * only on the visitor's own click.
 */
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingShell } from '@/components/features/onboarding/OnboardingShell';

const { authState, claimSpy, pushMock, replaceMock, conversionState } =
  vi.hoisted(() => ({
    authState: { isLoaded: true, isSignedIn: true },
    claimSpy: vi.fn(),
    pushMock: vi.fn(),
    replaceMock: vi.fn(),
    conversionState: { shown: false },
  }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({
    isLoaded: authState.isLoaded,
    isSignedIn: authState.isSignedIn,
    userId: 'user_returning',
  }),
  useCanRenderClerkUi: () => false,
}));

vi.mock('@/components/organisms/AppShellFrame', () => ({
  AppShellFrame: ({ main }: { readonly main: ReactNode }) => <>{main}</>,
}));

vi.mock('@/components/organisms/sidebar', () => ({
  SidebarProvider: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));

let conversationActivity: (() => void) | undefined;

vi.mock('@/components/features/onboarding/OnboardingChat', () => ({
  OnboardingChat: ({
    onConversationActivity,
  }: {
    readonly onConversationActivity?: () => void;
  }) => {
    conversationActivity = onConversationActivity;
    return <div data-testid='onboarding-chat' />;
  },
  // The claim hook reads these to arm returning signed-in visitors; the
  // default (false) models "no conversion card rendered yet".
  hasOnboardingConversionSurfaceShown: () => conversionState.shown,
  markOnboardingConversionSurface: () => {
    conversionState.shown = true;
  },
  resetOnboardingConversionSurfaceForTests: () => {
    conversionState.shown = false;
  },
}));

vi.mock('@/components/features/onboarding/OnboardingTurnstile', () => ({
  getBrowserTurnstileHostname: () => 'localhost',
  isOnboardingTurnstilePanelVisible: () => false,
  OnboardingTurnstile: () => null,
  resolveTurnstileSiteKey: () => null,
}));

function claimResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('onboarding claim auto-navigation (JOV-8068)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    claimSpy.mockClear();
    pushMock.mockClear();
    replaceMock.mockClear();
    conversionState.shown = false;
  });

  it('never claims or navigates on mount or after a turn for a returning signed-in visitor', async () => {
    const fetchMock = vi.fn().mockImplementation(async url => {
      if (url === '/api/onboarding/claim') {
        claimSpy();
        return claimResponse({ claimed: 1 });
      }
      // Analytics beacons etc. resolve quietly; only the claim POST counts.
      return claimResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<OnboardingShell sessionLabel='returning' isSignedIn />);

    // Mount: no claim POST, no navigation.
    await waitFor(() => {
      expect(screen.getByTestId('onboarding-chat')).toBeInTheDocument();
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(claimSpy).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('onboarding-claim-handoff')).toBeNull();

    // A completed chat turn: still no claim POST and no navigation without a click.
    conversationActivity?.();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(claimSpy).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('onboarding-claim-handoff')).toBeNull();
  });

  it('renders the inline handoff card after a claimed turn and navigates only via its link', async () => {
    const fetchMock = vi.fn().mockImplementation(async url => {
      if (url === '/api/onboarding/claim') {
        claimSpy();
        return claimResponse({ claimed: 1 });
      }
      return claimResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<OnboardingShell sessionLabel='handoff' isSignedIn />);
    await waitFor(() => {
      expect(screen.getByTestId('onboarding-chat')).toBeInTheDocument();
    });

    // The conversion card renders (the explicit user-facing offer)...
    conversionState.shown = true;

    // ...then a completed turn claims — but must NOT navigate by itself.
    conversationActivity?.();
    await waitFor(() => {
      expect(screen.getByTestId('onboarding-claim-handoff')).toHaveAttribute(
        'data-handoff-kind',
        'checkout'
      );
    });
    expect(claimSpy).toHaveBeenCalledTimes(1);
    expect(pushMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();

    // Navigation is the visitor's explicit click on the card link.
    const link = screen.getByRole('link', { name: /continue/i });
    expect(link).toHaveAttribute('href', '/onboarding/checkout');
  });
});
