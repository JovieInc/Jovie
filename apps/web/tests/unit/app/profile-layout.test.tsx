import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const clientProvidersSpy = vi.fn(
  ({
    children,
  }: {
    readonly children: React.ReactNode;
    readonly publishableKey: string | undefined;
    readonly skipCoreProviders?: boolean;
  }) => <div data-testid='client-providers'>{children}</div>
);

vi.mock('@/components/providers/ClientProviders', () => ({
  ClientProviders: (props: {
    readonly children: React.ReactNode;
    readonly publishableKey: string | undefined;
    readonly skipCoreProviders?: boolean;
  }) => clientProvidersSpy(props),
}));

vi.mock('@/lib/env-public', () => ({
  publicEnv: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_example',
  },
}));

import ProfileLayout from '@/app/[username]/layout';

describe('ProfileLayout', () => {
  it('passes the publishable key and skips core providers without forcing Clerk bypass', () => {
    render(
      <ProfileLayout>
        <div data-testid='profile-child'>Profile</div>
      </ProfileLayout>
    );

    expect(screen.getByTestId('client-providers')).toBeInTheDocument();
    expect(screen.getByTestId('profile-child')).toBeInTheDocument();
    expect(clientProvidersSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        publishableKey: 'pk_live_example',
        skipCoreProviders: true,
      })
    );
    expect(clientProvidersSpy).toHaveBeenCalledWith(
      expect.not.objectContaining({
        forceBypassClerk: true,
      })
    );
  });
});
