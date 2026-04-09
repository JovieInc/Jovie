import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { clientProvidersMock } = vi.hoisted(() => ({
  clientProvidersMock: vi.fn(),
}));

vi.mock('@/components/providers/ClientProviders', () => ({
  ClientProviders: ({
    children,
    forceBypassClerk,
    publishableKey,
    skipCoreProviders,
  }: {
    children: ReactNode;
    forceBypassClerk?: boolean;
    publishableKey: string | undefined;
    skipCoreProviders?: boolean;
  }) => {
    clientProvidersMock({
      forceBypassClerk,
      publishableKey,
      skipCoreProviders,
    });

    return (
      <div
        data-testid='client-providers'
        data-publishable-key={publishableKey ?? 'undefined'}
        data-skip-core-providers={skipCoreProviders ? 'true' : 'false'}
      >
        {children}
      </div>
    );
  },
}));

interface RenderProfileLayoutOptions {
  readonly clerkMockFlag?: string;
  readonly e2eMode?: string;
  readonly nodeEnv?: string;
  readonly publishableKey?: string;
  readonly vercelEnv?: string;
}

async function renderProfileLayout({
  clerkMockFlag = '0',
  e2eMode = '0',
  nodeEnv = 'production',
  publishableKey = 'pk_live_example',
  vercelEnv,
}: RenderProfileLayoutOptions = {}) {
  vi.resetModules();
  vi.unstubAllEnvs();

  vi.stubEnv('NEXT_PUBLIC_CLERK_MOCK', clerkMockFlag);
  vi.stubEnv('NEXT_PUBLIC_E2E_MODE', e2eMode);
  vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', publishableKey);
  vi.stubEnv('NODE_ENV', nodeEnv);

  if (vercelEnv) {
    vi.stubEnv('VERCEL_ENV', vercelEnv);
  }

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
  vi.unstubAllEnvs();
});

describe('ProfileLayout', () => {
  it('keeps Clerk enabled for production public profile routes', async () => {
    await renderProfileLayout();

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(clientProvidersMock).toHaveBeenCalledWith({
      forceBypassClerk: false,
      publishableKey: 'pk_live_example',
      skipCoreProviders: true,
    });
  });

  it('bypasses Clerk for preview public profile routes', async () => {
    await renderProfileLayout({ vercelEnv: 'preview' });

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(clientProvidersMock).toHaveBeenCalledWith({
      forceBypassClerk: true,
      publishableKey: 'pk_live_example',
      skipCoreProviders: true,
    });
  });
});
