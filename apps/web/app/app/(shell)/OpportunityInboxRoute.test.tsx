import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const mocks = vi.hoisted(() => ({
  getCanonicalProfileDSPs: vi.fn(),
  getDashboardShellData: vi.fn(),
  getProfileSocialLinks: vi.fn(),
  loadAuthenticatedAppShellUserId: vi.fn(),
  loadOpportunityInboxData: vi.fn(),
  loadOpportunityInboxTourDateSections: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock(
  '@/components/features/opportunity-inbox/OpportunityInboxPageClient',
  () => ({
    OpportunityInboxPageClient: ({
      connectedDSPs,
      inbox,
      initialLinks,
    }: {
      readonly connectedDSPs: readonly { readonly id: string }[];
      readonly inbox: {
        readonly cards: readonly unknown[];
        readonly tourDates?: { readonly pending: readonly unknown[] };
      };
      readonly initialLinks: readonly { readonly id: string }[];
    }) => (
      <div
        data-testid='opportunity-inbox-client'
        data-card-count={inbox.cards.length}
        data-connected-dsp-count={connectedDSPs.length}
        data-initial-link-count={initialLinks.length}
        data-pending-tour-date-count={inbox.tourDates?.pending.length ?? 0}
      />
    ),
  })
);

vi.mock('@/lib/connectors/opportunity-inbox-data', () => ({
  loadOpportunityInboxData: mocks.loadOpportunityInboxData,
  loadOpportunityInboxTourDateSections:
    mocks.loadOpportunityInboxTourDateSections,
}));

vi.mock('@/lib/profile-dsps', () => ({
  getCanonicalProfileDSPs: mocks.getCanonicalProfileDSPs,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@/app/app/(shell)/app-shell-route-context', () => ({
  loadAuthenticatedAppShellUserId: mocks.loadAuthenticatedAppShellUserId,
}));

vi.mock('@/app/app/(shell)/dashboard/actions', () => ({
  getDashboardShellData: mocks.getDashboardShellData,
  getProfileSocialLinks: mocks.getProfileSocialLinks,
}));

import { OpportunityInboxRoute } from './OpportunityInboxRoute';

const BASE_INBOX = {
  cards: [{ id: 'card-1' }],
  emptyActionCards: [],
};

const TOUR_DATES = {
  pending: [{ id: 'tour-1' }],
  confirmed: [],
  rejected: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(next => {
    resolve = next;
  });
  return { promise, resolve };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('OpportunityInboxRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadAuthenticatedAppShellUserId.mockResolvedValue('user-1');
    mocks.getDashboardShellData.mockResolvedValue({
      dashboardLoadError: null,
      selectedProfile: { id: 'profile-1', username: 'artist' },
    });
    mocks.loadOpportunityInboxData.mockResolvedValue(BASE_INBOX);
    mocks.getProfileSocialLinks.mockResolvedValue([{ id: 'link-1' }]);
    mocks.loadOpportunityInboxTourDateSections.mockResolvedValue(TOUR_DATES);
    mocks.getCanonicalProfileDSPs.mockReturnValue([{ id: 'spotify' }]);
  });

  it('starts the inbox query before profile resolution completes', async () => {
    const profileSeed = deferred<{
      readonly dashboardLoadError: null;
      readonly selectedProfile: { readonly id: string };
    }>();
    mocks.getDashboardShellData.mockReturnValue(profileSeed.promise);

    const routePromise = OpportunityInboxRoute();
    await flushPromises();

    expect(mocks.getDashboardShellData).toHaveBeenCalledWith('user-1');
    expect(mocks.loadOpportunityInboxData).toHaveBeenCalledWith('user-1');
    expect(mocks.getProfileSocialLinks).not.toHaveBeenCalled();

    profileSeed.resolve({
      dashboardLoadError: null,
      selectedProfile: { id: 'profile-1' },
    });

    render(await routePromise);
    expect(screen.getByTestId('opportunity-inbox-client')).toBeInTheDocument();
  });

  it('loads profile links and tour dates in parallel with the base inbox', async () => {
    const baseInbox = deferred<typeof BASE_INBOX>();
    mocks.loadOpportunityInboxData.mockReturnValue(baseInbox.promise);

    const routePromise = OpportunityInboxRoute();
    await flushPromises();

    expect(mocks.getProfileSocialLinks).toHaveBeenCalledWith('profile-1');
    expect(mocks.loadOpportunityInboxTourDateSections).toHaveBeenCalledWith(
      'profile-1'
    );

    baseInbox.resolve(BASE_INBOX);
    render(await routePromise);

    const client = screen.getByTestId('opportunity-inbox-client');
    expect(client).toHaveAttribute('data-card-count', '1');
    expect(client).toHaveAttribute('data-initial-link-count', '1');
    expect(client).toHaveAttribute('data-connected-dsp-count', '1');
    expect(client).toHaveAttribute('data-pending-tour-date-count', '1');
  });

  it('redirects missing app users to sign in with the inbox return target', async () => {
    mocks.loadOpportunityInboxData.mockResolvedValue(null);

    await expect(OpportunityInboxRoute()).rejects.toThrow(
      `REDIRECT:${APP_ROUTES.SIGNIN}?redirect_url=${encodeURIComponent(
        APP_ROUTES.DASHBOARD
      )}`
    );
  });
});
