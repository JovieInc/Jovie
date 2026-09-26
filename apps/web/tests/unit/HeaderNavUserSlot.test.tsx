import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { HeaderNav } from '@/components/organisms/HeaderNav';
import { UserButton } from '@/components/organisms/user-button';
import { APP_ROUTES } from '@/constants/routes';

// Clerk hooks are pulled transitively by UserButton/AuthActions; the signed-out
// defaults are enough because MobileNav itself is mocked to capture the slot.
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false, userId: null }),
  useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
  useSession: () => ({ isLoaded: true, isSignedIn: false, session: null }),
  useClerk: () => ({ setActive: async () => {} }),
  useSignIn: () => ({ fetchStatus: 'idle', errors: [], signIn: null }),
  SignedIn: () => null,
  SignedOut: ({ children }: { children: React.ReactNode }) => children,
}));

interface CapturedMobileNavProps {
  readonly authenticatedUserSlot?: ReactNode;
}

const capturedProps: CapturedMobileNavProps[] = [];

vi.mock('@/components/molecules/MobileNav', () => ({
  MobileNav: (props: CapturedMobileNavProps) => {
    capturedProps.push(props);
    return null;
  },
}));

describe('HeaderNav authenticated mobile user slot', () => {
  it('passes the design-system identity variant props to UserButton', () => {
    render(<HeaderNav navLinks={[{ href: '/pricing', label: 'Pricing' }]} />);

    const last = capturedProps.at(-1);
    expect(last?.authenticatedUserSlot).toBeTruthy();

    const slot = last?.authenticatedUserSlot as React.ReactElement<{
      showUserInfo?: boolean;
      settingsHref?: string;
    }>;
    // JOV-5349: production must render the design-system showUserInfo variant,
    // not the bare compact avatar default.
    expect(slot.type).toBe(UserButton);
    expect(slot.props.showUserInfo).toBe(true);
    expect(slot.props.settingsHref).toBe(APP_ROUTES.SETTINGS);
  });
});
