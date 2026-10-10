import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const mocks = vi.hoisted(() => ({
  pendingFailure: null as null | (() => void),
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
        readonly cards: readonly { readonly id: string }[];
        readonly availability?: {
          readonly suggestedActions: string;
          readonly tourDates: string;
        };
        readonly tourDates?: { readonly pending: readonly unknown[] };
      };
      readonly initialLinks: readonly { readonly id: string }[];
    }) => {
      const [cards, setCards] = useState(inbox.cards);
      useEffect(() => setCards(inbox.cards), [inbox.cards]);
      return (
        <div
          data-testid='opportunity-inbox-client'
          data-card-count={cards.length}
          data-suggestion-availability={inbox.availability?.suggestedActions}
          data-tour-availability={inbox.availability?.tourDates}
          data-connected-dsp-count={connectedDSPs.length}
          data-initial-link-count={initialLinks.length}
          data-pending-tour-date-count={inbox.tourDates?.pending.length ?? 0}
        >
          {cards.map(card => (
            <span key={card.id}>{card.id}</span>
          ))}
          <button
            type='button'
            onClick={() => {
              const card = cards[0];
              setCards([]);
              mocks.pendingFailure = () =>
                setCards(current => [card, ...current]);
            }}
          >
            Approve
          </button>
        </div>
      );
    },
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
  availability: { suggestedActions: 'available', tourDates: 'not_requested' },
  cards: [{ id: 'card-1' }],
  emptyActionCards: [],
};

const TOUR_DATES = {
  availability: 'available',
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
    mocks.pendingFailure = null;
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

  it('does not restore a previous account card when its pending mutation fails after an identity switch', async () => {
    mocks.loadAuthenticatedAppShellUserId.mockResolvedValue('founder');
    mocks.loadOpportunityInboxData.mockResolvedValue({
      ...BASE_INBOX,
      cards: [{ id: 'founder-card' }],
    });
    const view = render(await OpportunityInboxRoute());
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(screen.queryByText('founder-card')).not.toBeInTheDocument();

    mocks.loadAuthenticatedAppShellUserId.mockResolvedValue('customer');
    mocks.loadOpportunityInboxData.mockResolvedValue({
      ...BASE_INBOX,
      cards: [{ id: 'customer-card' }],
    });
    view.rerender(await OpportunityInboxRoute());
    expect(screen.getByText('customer-card')).toBeInTheDocument();
    act(() => mocks.pendingFailure?.());
    expect(screen.queryByText('founder-card')).not.toBeInTheDocument();
    expect(screen.getByText('customer-card')).toBeInTheDocument();
    expect(mocks.loadOpportunityInboxData).toHaveBeenLastCalledWith('customer');
  });

  it('does not restore a previous profile card after a same-owner profile switch', async () => {
    const view = render(await OpportunityInboxRoute());
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    mocks.getDashboardShellData.mockResolvedValue({
      dashboardLoadError: null,
      selectedProfile: { id: 'profile-2', username: 'other-artist' },
    });
    mocks.loadOpportunityInboxData.mockResolvedValue({
      ...BASE_INBOX,
      cards: [{ id: 'profile-2-card' }],
    });
    view.rerender(await OpportunityInboxRoute());
    act(() => mocks.pendingFailure?.());
    expect(screen.queryByText('card-1')).not.toBeInTheDocument();
    expect(screen.getByText('profile-2-card')).toBeInTheDocument();
  });

  it('preserves pending mutation recovery for the same identity during a route refresh', async () => {
    const view = render(await OpportunityInboxRoute());
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    view.rerender(await OpportunityInboxRoute());
    expect(screen.queryByText('card-1')).not.toBeInTheDocument();
    act(() => mocks.pendingFailure?.());
    expect(screen.getByText('card-1')).toBeInTheDocument();
  });

  it('forwards failed and missing attempted-read metadata without losing loaded cards', async () => {
    mocks.loadOpportunityInboxTourDateSections.mockResolvedValue({
      ...TOUR_DATES,
      availability: undefined,
    });
    render(await OpportunityInboxRoute());
    expect(screen.getByTestId('opportunity-inbox-client')).toHaveAttribute(
      'data-tour-availability',
      'unknown'
    );
    expect(screen.getByTestId('opportunity-inbox-client')).toHaveAttribute(
      'data-card-count',
      '1'
    );
  });
  it('does not certify tour availability when profile context fails to load', async () => {
    mocks.getDashboardShellData.mockRejectedValue(
      new Error('profile unavailable')
    );
    render(await OpportunityInboxRoute());
    expect(screen.getByTestId('opportunity-inbox-client')).toHaveAttribute(
      'data-tour-availability',
      'unknown'
    );
    expect(mocks.loadOpportunityInboxTourDateSections).not.toHaveBeenCalled();
  });
  it('keeps an intentionally absent selected profile distinct from a failed read', async () => {
    mocks.getDashboardShellData.mockResolvedValue({
      dashboardLoadError: null,
      selectedProfile: null,
    });
    render(await OpportunityInboxRoute());
    expect(screen.getByTestId('opportunity-inbox-client')).toHaveAttribute(
      'data-tour-availability',
      'not_requested'
    );
    expect(mocks.loadOpportunityInboxTourDateSections).not.toHaveBeenCalled();
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
