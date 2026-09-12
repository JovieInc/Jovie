import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { clientProvidersMock } = vi.hoisted(() => ({
  clientProvidersMock: vi.fn(),
}));

vi.mock('@/components/providers/ClientProviders', () => ({
  ClientProviders: ({
    children,
    forceSignedOutDefaults,
    skipCoreProviders,
  }: {
    children: ReactNode;
    forceSignedOutDefaults?: boolean;
    skipCoreProviders?: boolean;
  }) => {
    clientProvidersMock({
      forceSignedOutDefaults,
      skipCoreProviders,
    });

    return (
      <div
        data-testid='client-providers'
        data-force-signed-out-defaults={
          forceSignedOutDefaults ? 'true' : 'false'
        }
        data-skip-core-providers={skipCoreProviders ? 'true' : 'false'}
      >
        {children}
      </div>
    );
  },
}));

async function renderProfileLayout() {
  vi.resetModules();

  const { default: ProfileLayout } = await import('@/app/[username]/layout');

  render(
    <ProfileLayout>
      <div data-testid='child'>profile page</div>
    </ProfileLayout>
  );
}

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('ProfileLayout', () => {
  it('uses signed-out defaults on public profile routes', async () => {
    await renderProfileLayout();

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(clientProvidersMock).toHaveBeenCalledWith({
      forceSignedOutDefaults: true,
      skipCoreProviders: true,
    });
  });
});
