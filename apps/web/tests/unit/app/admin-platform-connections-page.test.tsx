import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCaptureError,
  mockLoadAdminPlatformConnectionsData,
  mockPlatformConnectionsClient,
} = vi.hoisted(() => ({
  mockCaptureError: vi.fn(),
  mockLoadAdminPlatformConnectionsData: vi.fn(),
  mockPlatformConnectionsClient: vi.fn(() => (
    <div data-testid='admin-platform-connections-client-probe' />
  )),
}));

vi.mock('@/components/features/admin/layout/AdminPage', () => ({
  AdminPage: ({
    children,
    title,
    description,
    testId,
  }: {
    children: ReactNode;
    title: string;
    description: string;
    testId: string;
  }) => (
    <section data-testid={testId}>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </section>
  ),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock(
  '@/app/app/(shell)/admin/platform-connections/platform-connections-data',
  () => ({
    loadAdminPlatformConnectionsData: mockLoadAdminPlatformConnectionsData,
  })
);

vi.mock(
  '@/app/app/(shell)/admin/platform-connections/PlatformConnectionsClient',
  () => ({
    PlatformConnectionsClient: mockPlatformConnectionsClient,
  })
);

describe('AdminPlatformConnectionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadAdminPlatformConnectionsData.mockResolvedValue({
      spotifyStatus: {
        connected: true,
        healthy: true,
        source: 'database',
        clerkUserId: 'user_123',
        accountLabel: 'Jovie Publisher',
        approvedScopes: ['playlist-read-private'],
        missingScopes: [],
        updatedAt: null,
        updatedByUserId: null,
        error: null,
      },
      engineSettings: {
        enabled: true,
        intervalValue: 3,
        intervalUnit: 'days',
        lastGeneratedAt: null,
        nextEligibleAt: null,
      },
      currentUser: {
        hasSpotify: true,
        label: 'Jovie Publisher',
        missingScopes: [],
      },
    });
  });

  it('renders safe fallback props when optional platform status loading fails', async () => {
    mockLoadAdminPlatformConnectionsData.mockRejectedValueOnce(
      new Error('platform connections unavailable')
    );

    const { default: AdminPlatformConnectionsPage } = await import(
      '@/app/app/(shell)/admin/platform-connections/page'
    );

    render(
      await AdminPlatformConnectionsPage({
        searchParams: Promise.resolve({ tab: 'engine' }),
      })
    );

    expect(
      screen.getByTestId('admin-platform-connections')
    ).toBeInTheDocument();
    expect(screen.getByText('Platform Connections')).toBeInTheDocument();
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Admin platform connections failed to load optional settings',
      expect.any(Error),
      expect.objectContaining({ route: 'admin/platform-connections' })
    );
    expect(mockPlatformConnectionsClient).toHaveBeenCalledWith(
      expect.objectContaining({
        currentTab: 'engine',
        spotifyStatus: expect.objectContaining({
          connected: false,
          healthy: false,
          source: 'missing',
          accountLabel: null,
          approvedScopes: [],
          missingScopes: [],
          error: null,
        }),
        engineSettings: expect.objectContaining({
          enabled: false,
          intervalValue: 3,
          intervalUnit: 'days',
          lastGeneratedAt: null,
          nextEligibleAt: null,
        }),
        currentUser: expect.objectContaining({
          hasSpotify: false,
          label: null,
          missingScopes: [],
        }),
      }),
      undefined
    );
  });
});
