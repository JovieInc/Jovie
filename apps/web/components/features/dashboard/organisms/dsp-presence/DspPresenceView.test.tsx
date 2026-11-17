import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DspPresenceData,
  DspPresenceItem,
} from '@/app/app/(shell)/dashboard/presence/actions';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import { TableMetaProvider } from '@/contexts/TableMetaContext';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DspPresenceView } from './DspPresenceView';

const { dashboard, triggerDiscovery } = vi.hoisted(() => ({
  dashboard: {
    isAdmin: false,
    selectedProfile: {
      id: 'profile-1',
      spotifyId: 'artist-1' as string | null,
      spotifyUrl: null,
    },
  },
  triggerDiscovery: vi.fn(),
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => dashboard,
}));

vi.mock('@/app/app/(shell)/dashboard/presence/actions', () => ({
  addManualDspMatch: vi.fn(),
}));

vi.mock('@/lib/queries/useDspEnrichmentStatusQuery', async importOriginal => ({
  ...(await importOriginal<
    typeof import('@/lib/queries/useDspEnrichmentStatusQuery')
  >()),
  useDspEnrichmentStatusQuery: () => ({ data: undefined }),
}));

vi.mock('@/lib/queries/useDspEnrichmentMutations', () => ({
  useTriggerDiscoveryMutation: () => ({
    mutate: triggerDiscovery,
    isPending: false,
  }),
}));

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}));

vi.mock('./CatalogHealthSection', () => ({
  CatalogHealthSection: ({ spotifyId }: { spotifyId: string | null }) => (
    <section aria-label='Catalog Health' data-spotify-id={spotifyId ?? ''} />
  ),
}));

vi.mock('./DspPresenceSidebar', () => ({
  DspPresenceSidebar: ({
    item,
    onClose,
  }: {
    item: DspPresenceItem;
    onClose: () => void;
  }) => (
    <aside aria-label='Presence details'>
      <span>{item.externalArtistName}</span>
      <button type='button' onClick={onClose}>
        Close details
      </button>
    </aside>
  ),
}));

const apple: DspPresenceItem = {
  matchId: 'match-apple',
  providerId: 'apple_music',
  status: 'confirmed',
  confidenceScore: 1,
  matchingIsrcCount: 12,
  matchSource: 'manual',
  confirmedAt: '2026-11-01T00:00:00Z',
  externalArtistName: 'Sasha Waves',
  externalArtistUrl: 'https://music.apple.com/us/artist/sasha-waves/123456',
  externalArtistImageUrl: null,
  confidenceBreakdown: null,
};

function RightPanel() {
  return <>{useRightPanel()}</>;
}

function renderView(data: DspPresenceData, dir?: 'rtl') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <TableMetaProvider>
          <RightPanelProvider>
            <div dir={dir}>
              <DspPresenceView data={data} />
            </div>
            <RightPanel />
          </RightPanelProvider>
        </TableMetaProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  dashboard.isAdmin = false;
  dashboard.selectedProfile.spotifyId = 'artist-1';
  triggerDiscovery.mockReset();
});

describe('DspPresenceView', () => {
  it('opens and closes the details panel from a row', async () => {
    const user = userEvent.setup();
    const { container } = renderView({
      items: [apple],
      confirmedCount: 1,
      suggestedCount: 0,
    });

    expect(screen.getByText('1 matched platform')).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Catalog Health' })
    ).toHaveAttribute('data-spotify-id', 'artist-1');
    await expectNoA11yViolations(container);

    await user.click(screen.getByText('Sasha Waves'));
    const panel = await screen.findByRole('complementary', {
      name: 'Presence details',
    });
    expect(panel).toHaveTextContent('Sasha Waves');
    await user.click(screen.getByRole('button', { name: 'Close details' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('complementary', { name: 'Presence details' })
      ).toBeNull()
    );
  });

  it('opens the add platform dialog from the empty state', async () => {
    const user = userEvent.setup();
    const { container } = renderView({
      items: [],
      confirmedCount: 0,
      suggestedCount: 0,
    });

    expect(screen.getByText('No DSP Profiles Found')).toBeInTheDocument();
    await expectNoA11yViolations(container);
    const addButtons = screen.getAllByRole('button', { name: /add platform/i });
    await user.click(addButtons[addButtons.length - 1]);
    expect(await screen.findByRole('dialog')).toHaveTextContent('Add Platform');
  });

  it('lets an admin re-scan and hides the refresh control from others', async () => {
    const user = userEvent.setup();
    const data = { items: [apple], confirmedCount: 1, suggestedCount: 2 };
    const member = renderView(data);
    expect(screen.getByText('2 pending')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Re-scan streaming platforms' })
    ).toBeNull();
    await expectNoA11yViolations(member.container);
    member.unmount();

    dashboard.isAdmin = true;
    renderView(data);
    await user.click(
      screen.getByRole('button', { name: 'Re-scan streaming platforms' })
    );
    expect(triggerDiscovery).toHaveBeenCalledWith(
      { profileId: 'profile-1', spotifyArtistId: 'artist-1' },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it('keeps long names and an RTL document accessible', async () => {
    const longName =
      'ساشا ويفز والفرقة الموسيقية الدولية للموسيقى الإلكترونية والتجريبية';
    const { container } = renderView(
      {
        items: [{ ...apple, externalArtistName: longName }],
        confirmedCount: 1,
        suggestedCount: 0,
      },
      'rtl'
    );
    expect(screen.getByText(longName)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
