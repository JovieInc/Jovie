import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const { authLayoutMock, authShellMock, pageMock, trackMock } = vi.hoisted(
  () => ({
    authLayoutMock: vi.fn(),
    authShellMock: vi.fn(),
    pageMock: vi.fn(),
    trackMock: vi.fn(),
  })
);

vi.mock('@/lib/analytics', () => ({
  page: (...args: unknown[]) => pageMock(...args),
  track: (...args: unknown[]) => trackMock(...args),
}));

vi.mock('@/features/auth', async () => {
  const reactModule = await import('react');
  return {
    AuthLayout: (props: { children: ReactNode }) => {
      authLayoutMock(props);
      return reactModule.createElement(
        'div',
        { 'data-testid': 'auth-layout' },
        props.children
      );
    },
    AuthRoutePrefetch: () => null,
    AuthShell: (props: Record<string, unknown>) => {
      authShellMock(props);
      return reactModule.createElement('div', { 'data-testid': 'auth-shell' });
    },
  };
});

import { APP_ROUTES } from '@/constants/routes';
import { WAITLIST_FRONT_DOOR_VARIANT_ID } from '@/data/homepageFrontDoorCta';
import { WaitlistPublicLanding } from './WaitlistPublicLanding';

describe('WaitlistPublicLanding', () => {
  it('renders splash-B sign-up on the waitlist URL without a second Get started', () => {
    render(<WaitlistPublicLanding />);

    expect(authLayoutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chrome: 'splash-b',
        layoutVariant: 'stack',
        showFormTitle: false,
        showFooterPrompt: false,
      })
    );
    expect(authShellMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'sign-up',
        oppositeModeUrl: APP_ROUTES.SIGNIN,
        fallbackRedirectUrl: APP_ROUTES.START,
        suppressOneTap: true,
      })
    );
    expect(screen.getByTestId('auth-shell')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Get started' })
    ).not.toBeInTheDocument();
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
