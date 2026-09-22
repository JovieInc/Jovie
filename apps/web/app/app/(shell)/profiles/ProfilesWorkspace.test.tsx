import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HeaderActionsProvider,
  useHeaderActions,
} from '@/contexts/HeaderActionsContext';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import { classifyConnectionInput } from './AddConnectionRail';
import type { ProfilesWorkspaceData } from './data';
import { ProfilesWorkspace } from './ProfilesWorkspace';

const navigationMock = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: navigationMock.push,
    replace: navigationMock.replace,
    refresh: navigationMock.refresh,
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => navigationMock.searchParams,
}));

describe('classifyConnectionInput', () => {
  it('normalizes and classifies a bare provider domain', () => {
    const result = classifyConnectionInput('Instagram.com/timwhite', [], 'Tim');

    expect(result.error).toBeNull();
    expect(result.candidate).toMatchObject({
      platformId: 'instagram',
      platformName: 'Instagram',
      url: 'https://instagram.com/timwhite',
    });
  });

  it('offers ranked handle-capable platforms for an at-handle', () => {
    const result = classifyConnectionInput('@timwhite', [], 'Tim');

    expect(result.candidate).toBeNull();
    expect(result.suggestions.slice(0, 4).map(item => item.platformId)).toEqual(
      ['instagram', 'tiktok', 'youtube', 'twitter']
    );
    expect(result.suggestions[0]).toMatchObject({
      handle: '@timwhite',
      url: 'https://instagram.com/timwhite',
    });
  });

  it('fuzzy filters a platform-qualified username', () => {
    const result = classifyConnectionInput('insta timwhite', [], 'Tim');

    expect(result.suggestions[0]).toMatchObject({
      platformId: 'instagram',
      handle: '@timwhite',
    });
  });

  it('does not suggest a platform that already exists', () => {
    const result = classifyConnectionInput('@timwhite', ['instagram'], 'Tim');

    expect(result.suggestions.map(item => item.platformId)).not.toContain(
      'instagram'
    );
  });

  it('rejects credential-bearing URLs', () => {
    const credentialBearingUrl = [
      'https://user',
      'pass@instagram.com/timwhite',
    ].join(':');
    const result = classifyConnectionInput(credentialBearingUrl, [], 'Tim');

    expect(result.candidate).toBeNull();
    expect(result.error).toMatch(/without credentials/i);
  });
});

vi.mock('@/hooks/useRegisterRightPanel', () => ({
  useRegisterRightPanel: vi.fn(),
}));

const data: ProfilesWorkspaceData = {
  profileId: '11111111-1111-4111-8111-111111111111',
  artist: {
    name: 'Tim White',
    username: 'tim',
    avatarUrl: 'https://cdn.jov.ie/tim.jpg',
    isPublic: true,
  },
  rows: [
    {
      id: 'jovie',
      rowType: 'surface',
      kind: 'jovie',
      platform: 'jovie',
      label: 'Jovie Profile',
      handle: '@tim',
      url: 'https://jov.ie/tim',
      trackedUrl: null,
      qualificationStatus: 'qualified',
      isOfficial: true,
      monitoringState: 'active',
      rank: 2,
      previousRank: 4,
      lastObservedAt: '2026-07-16T00:00:00.000Z',
      identityPhoto: {
        url: 'https://cdn.jov.ie/tim.jpg',
        source: 'jovie',
        kind: 'profile',
        verified: true,
        observedAt: '2026-07-16T00:00:00.000Z',
        freshness: 'current',
      },
    },
    {
      id: 'spotify',
      rowType: 'surface',
      kind: 'dsp',
      platform: 'spotify',
      label: 'Spotify',
      handle: null,
      url: 'https://open.spotify.com/artist/tim',
      trackedUrl: 'https://jov.ie/tim/s/spotify',
      qualificationStatus: 'qualified',
      isOfficial: true,
      monitoringState: 'locked',
      rank: 7,
      previousRank: 9,
      lastObservedAt: '2026-07-16T00:00:00.000Z',
      identityPhoto: {
        url: 'https://i.scdn.co/image/tim.jpg',
        source: 'connector',
        kind: 'profile',
        verified: true,
        observedAt: '2026-07-16T00:00:00.000Z',
        freshness: 'current',
      },
    },
    {
      id: 'instagram',
      rowType: 'surface',
      kind: 'social',
      platform: 'instagram',
      label: 'Instagram',
      handle: '@tim',
      url: 'https://instagram.com/tim',
      trackedUrl: 'https://jov.ie/tim/s/instagram',
      qualificationStatus: 'qualified',
      isOfficial: true,
      monitoringState: 'active',
      rank: 4,
      previousRank: 5,
      lastObservedAt: '2026-07-16T00:00:00.000Z',
    },
  ],
  monitoringLimit: 5,
  monitoredCount: 1,
  qualifiedShare: 0.5,
  bestJovieRank: 2,
  lastObservedAt: '2026-07-16T00:00:00.000Z',
  providerAvailable: true,
};

const dataWithConnector: ProfilesWorkspaceData = {
  ...data,
  rows: [
    ...data.rows,
    {
      id: 'gmail',
      rowType: 'connector',
      kind: 'connector',
      platform: 'gmail',
      label: 'Gmail',
      handle: 'artist@example.com',
      url: '/app/settings/connectors',
      status: 'connected',
      monitoringState: 'active',
    },
  ],
};

type SuggestionFixture = {
  readonly id: string;
  readonly type:
    | 'dsp_match'
    | 'social_link'
    | 'avatar'
    | 'playlist_fallback'
    | 'profile_ready';
  readonly platform: string;
  readonly platformLabel: string;
  readonly title: string;
  readonly subtitle: string;
  readonly imageUrl: string | null;
  readonly externalUrl: string | null;
  readonly confidence: number | null;
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function suggestionsResponse(suggestions: readonly SuggestionFixture[]) {
  return {
    success: true,
    suggestions,
    starterContext: null,
  };
}

function socialSuggestion(
  id: string,
  platform: string,
  handle: string,
  confidence = 0.92
): SuggestionFixture {
  return {
    id,
    type: 'social_link',
    platform,
    platformLabel: platform === 'tiktok' ? 'TikTok' : 'YouTube',
    title: handle,
    subtitle: 'Found via Spotify',
    imageUrl: null,
    externalUrl:
      platform === 'tiktok'
        ? `https://tiktok.com/${handle}`
        : `https://youtube.com/${handle}`,
    confidence,
  };
}

function dspSuggestion(
  id: string,
  title: string,
  confidence = 0.88
): SuggestionFixture {
  return {
    id,
    type: 'dsp_match',
    platform: 'spotify',
    platformLabel: 'Spotify',
    title,
    subtitle: 'Matched from catalog data',
    imageUrl: null,
    externalUrl: `https://open.spotify.com/artist/${id}`,
    confidence,
  };
}

function mockPersistedSuggestions(
  initialSuggestions: readonly SuggestionFixture[],
  options: { readonly failMutation?: boolean } = {}
) {
  let suggestions = [...initialSuggestions];
  const fetchMock = vi.mocked(globalThis.fetch);
  fetchMock.mockImplementation(async (input, init) => {
    const method = init?.method ?? 'GET';
    const url = String(input);
    if (method === 'POST') {
      if (options.failMutation) {
        return jsonResponse(
          { success: false, error: 'Mutation failed' },
          { status: 400, statusText: 'Bad Request' }
        );
      }
      suggestions = suggestions.filter(
        suggestion => !url.includes(encodeURIComponent(suggestion.id))
      );
      return jsonResponse({ success: true });
    }

    return jsonResponse(suggestionsResponse(suggestions));
  });
}

function renderWorkspace(workspaceData: ProfilesWorkspaceData | null) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <HeaderActionsProvider>
        <TooltipProvider>
          <RegisteredHeaderActions />
          <ProfilesWorkspace data={workspaceData} />
        </TooltipProvider>
      </HeaderActionsProvider>
    </QueryClientProvider>
  );
}

function RegisteredHeaderActions() {
  const { headerActions } = useHeaderActions();
  return <div data-testid='registered-header-actions'>{headerActions}</div>;
}

describe('ProfilesWorkspace', { timeout: 15_000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigationMock.searchParams = new URLSearchParams();
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise(() => {}) // never resolves for tests that don't opt in
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stops retrying forbidden suggestions and recovers saved suggestions on explicit retry', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: false, error: 'Forbidden' }, { status: 403 })
    );
    fetchMock.mockResolvedValue(
      jsonResponse(
        suggestionsResponse([
          socialSuggestion('saved-link', 'tiktok', '@artist'),
        ])
      )
    );
    renderWorkspace(data);
    await user.click(screen.getByRole('button', { name: 'Suggested' }));
    expect(await screen.findByText("Couldn't Load Suggestions")).toBeVisible();
    expect(
      screen.queryByText('Saved suggestions are still available. Try again.')
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(
      await screen.findByRole('list', {
        name: 'Suggested Connection Review Queue',
      })
    ).toBeVisible();
    expect(
      screen.queryByText("Couldn't Load Suggestions")
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('opens the exact counted review set and keeps unmeasured inventory separate during an outage', async () => {
    const user = userEvent.setup();
    const base = data.rows[0];
    if (base?.rowType !== 'surface') throw new Error('Missing surface fixture');
    renderWorkspace({
      ...data,
      providerAvailable: false,
      rows: [
        {
          ...base,
          id: 'review-a',
          label: 'Ambiguous A',
          platform: 'instagram',
          qualificationStatus: 'suggested',
          monitoringState: 'locked',
          rank: null,
        },
        {
          ...base,
          id: 'review-b',
          label: 'Ambiguous B',
          platform: 'instagram',
          qualificationStatus: 'conflicting',
        },
        {
          ...base,
          id: 'measured-later',
          label: 'Known Page',
          rank: null,
          lastObservedAt: null,
        },
      ],
    });
    expect(
      screen.getByRole('button', { name: 'Review Pages (2)' })
    ).toHaveAttribute('aria-pressed', 'true');
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).queryByText('Known Page')).not.toBeInTheDocument();
    expect(within(table).getAllByText('Instagram')).toHaveLength(2);
    await user.click(screen.getByText('Ambiguous A'));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    const rail = render(
      <TooltipProvider>{panel as ReactElement}</TooltipProvider>
    );
    expect(
      screen.getByRole('link', { name: 'Inspect Source' })
    ).toHaveAttribute('href', base.url);
    expect(
      screen.queryByRole('link', { name: 'Upgrade' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Review' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Identity confirmation is not yet available here/)
    ).toBeInTheDocument();
    rail.unmount();
    await user.click(screen.getByRole('button', { name: 'All Pages' }));
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(
      4
    );
    expect(screen.getByText('Known Page')).toBeInTheDocument();
    expect(screen.queryByText('Up to Date')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Identity Outcome' }));
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(
      4
    );
    expect(
      within(screen.getByTestId('presence-outcomes')).getByText('3 Pages')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Search Outcome' })
    ).not.toBeInTheDocument();
  });

  it('retains a useful inventory destination when the review queue is empty', async () => {
    renderWorkspace(data);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Review Pages (0)' }));
    expect(
      screen.getByText('No Pages Awaiting Identity Review')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'All Pages' }));
    expect(
      screen.getByRole('button', { name: 'Actions for Spotify' })
    ).toBeInTheDocument();
  });

  it('uses the canonical empty state with a direct artist-profile action', () => {
    renderWorkspace(null);

    expect(screen.getByTestId('profiles-workspace-empty-state')).toHaveClass(
      'py-16',
      'min-h-75'
    );
    expect(
      screen.getByRole('heading', { name: 'No Artist Profile Selected' })
    ).toHaveClass('text-2xl', 'font-semibold', 'text-primary-token');
    expect(
      screen.getByRole('link', { name: 'Set Up Artist Profile' })
    ).toHaveAttribute('href', '/app/settings/artist-profile');
  });

  it('uses attributable profile photos instead of platform icons as primary identity', async () => {
    renderWorkspace(data);

    const table = screen.getByRole('table');
    const spotifyPhoto = within(table).getByRole('img', {
      name: 'Tim White on Spotify',
    });
    expect(spotifyPhoto).toHaveAttribute('data-photo-kind', 'profile');
    expect(spotifyPhoto).toHaveAttribute('data-photo-verified', 'true');
    expect(
      decodeURIComponent(
        spotifyPhoto.querySelector('img')?.getAttribute('src') ?? ''
      )
    ).toContain('i.scdn.co/image/tim.jpg');

    const spotifyRow = screen
      .getByRole('button', { name: 'Actions for Spotify' })
      .closest('tr');
    expect(
      within(spotifyRow as HTMLElement).queryByText(/open\.spotify\.com/)
    ).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(within(spotifyRow as HTMLElement).getByText('Spotify'));
    expect(spotifyRow).toHaveAttribute('aria-selected', 'true');
  });

  it('shows recurring artist outcomes, all monitored pages, and a focused header action', async () => {
    renderWorkspace(data);

    expect(vi.mocked(useRegisterRightPanel)).toHaveBeenLastCalledWith(null);
    expect(screen.getByText('Spotify')).toBeInTheDocument();
    expect(screen.getByText('Jovie Profile')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Actions for Instagram' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Gmail')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All Pages' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    const outcomes = screen.getByTestId('presence-outcomes');
    expect(within(outcomes).getByText('Identity')).toBeInTheDocument();
    expect(within(outcomes).getByText('Profiles')).toBeInTheDocument();
    expect(within(outcomes).getByText('Catalog')).toBeInTheDocument();
    expect(within(outcomes).getByText('Search')).toBeInTheDocument();
    expect(within(outcomes).getByText('#2')).toBeInTheDocument();
    expect(within(outcomes).getByText('0 Pages')).toBeInTheDocument();
    expect(
      screen.queryByTestId('presence-photo-strip')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('7')).not.toBeInTheDocument();

    // JOV-6170: presence outcomes group by artist goal, not raw type.
    expect(
      screen.getByRole('button', { name: /^Identity$/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Profiles$/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Catalog$/ })
    ).toBeInTheDocument();
    const typeGlyph = screen.getByRole('img', {
      name: 'DSP profile type',
    });
    expect(typeGlyph).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'DSP profile type' })
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('registered-header-actions')).getByRole(
        'button',
        { name: 'Add Profile Or Site' }
      )
    ).toBeInTheDocument();

    const spotifyRow = screen.getByText('Spotify').closest('tr');
    expect(spotifyRow).not.toBeNull();
    expect(
      within(spotifyRow as HTMLElement)
        .getAllByText('Limit Reached')
        .some(element => !element.classList.contains('sr-only'))
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /^Profiles$/ }));
    expect(screen.getByText('Spotify')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Actions for Instagram' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Jovie Profile')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Identity$/ }));
    expect(screen.getByText('Jovie Profile')).toBeInTheDocument();
    expect(screen.queryByText('Spotify')).not.toBeInTheDocument();

    // Catalog outcome: authority/directory sources. Base fixture has none,
    // so the outcome tab renders the category empty state.
    fireEvent.click(screen.getByRole('button', { name: /^Catalog$/ }));
    expect(
      screen.getByText('No Presence in This Category')
    ).toBeInTheDocument();
    expect(screen.queryByText('Jovie Profile')).not.toBeInTheDocument();
    expect(screen.queryByText('Spotify')).not.toBeInTheDocument();

    expect(
      screen.getByRole('button', { name: 'Connectors' })
    ).toBeInTheDocument();
  });

  it('renders one explanation per suggested identity without a duplicate recommendation', async () => {
    renderWorkspace({
      ...data,
      rows: [
        ...data.rows,
        {
          id: 'fan-wiki',
          rowType: 'surface',
          kind: 'authority',
          platform: 'wikipedia',
          label: 'Fan Wiki',
          handle: null,
          url: 'https://example.com/wiki/tim',
          trackedUrl: null,
          qualificationStatus: 'suggested',
          isOfficial: false,
          monitoringState: 'unavailable',
          rank: null,
          previousRank: null,
          lastObservedAt: null,
        },
      ],
    });

    await userEvent.setup().click(screen.getByText('Fan Wiki'));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    expect(panel).not.toBeNull();

    render(<TooltipProvider>{panel as ReactElement}</TooltipProvider>);
    const signalList = screen.getByTestId('presence-signal-list');
    // Suggested qualification: recommendation primitive at its own weight.
    expect(
      within(signalList).queryByTestId('presence-signal-recommendation')
    ).not.toBeInTheDocument();
    expect(
      within(signalList).getByTestId('presence-signal-finding')
    ).toHaveTextContent('Needs Qualification');
  });

  it('groups presence signals into separated blocker, finding, and state primitives', async () => {
    const user = userEvent.setup();
    renderWorkspace(dataWithConnector);

    await user.click(screen.getByText('Gmail'));
    const connectorPanel = vi
      .mocked(useRegisterRightPanel)
      .mock.calls.at(-1)?.[0];
    expect(connectorPanel).not.toBeNull();
    const connectorRender = render(
      <TooltipProvider>{connectorPanel as ReactElement}</TooltipProvider>
    );

    const signalList = screen.getByTestId('presence-signal-list');
    // Connected connector: quiet state primitive only, no fabricated recs.
    expect(
      within(signalList).getByTestId('presence-signal-state')
    ).toHaveTextContent('Active');
    expect(
      within(signalList).queryByTestId('presence-signal-blocker')
    ).not.toBeInTheDocument();
    expect(
      within(signalList).queryByTestId('presence-signal-recommendation')
    ).not.toBeInTheDocument();

    connectorRender.unmount();
    await user.click(screen.getByRole('button', { name: 'All Pages' }));
    await user.click(screen.getByText('Spotify'));
    const dspPanel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    render(<TooltipProvider>{dspPanel as ReactElement}</TooltipProvider>);

    const dspSignals = screen.getByTestId('presence-signal-list');
    expect(
      within(dspSignals).getByTestId('presence-signal-finding')
    ).toHaveTextContent('Limit Reached');
    expect(
      within(dspSignals).queryByTestId('presence-signal-blocker')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Next Best Action')).not.toBeInTheDocument();
  });

  it('renders persisted suggestions without fabricating profile surface suggestions', async () => {
    const user = userEvent.setup();
    mockPersistedSuggestions([
      socialSuggestion('social-tiktok', 'tiktok', '@timwhite', 0.96),
      socialSuggestion('social-youtube', 'youtube', '@timwhite', 0.91),
    ]);
    renderWorkspace({
      ...data,
      rows: [
        ...data.rows,
        {
          id: 'fan-wiki',
          rowType: 'surface',
          kind: 'authority',
          platform: 'wikipedia',
          label: 'Fan Wiki',
          handle: null,
          url: 'https://example.com/wiki/tim',
          trackedUrl: null,
          qualificationStatus: 'suggested',
          isOfficial: false,
          monitoringState: 'unavailable',
          rank: null,
          previousRank: null,
          lastObservedAt: null,
        },
      ],
    });

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `/api/suggestions?profileId=${encodeURIComponent(data.profileId)}`,
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
    );
    await user.click(screen.getByRole('button', { name: 'Suggested' }));

    expect(
      await screen.findAllByTestId('suggested-connection-row')
    ).toHaveLength(2);
    expect(screen.getAllByTestId('suggested-connection-group')).toHaveLength(1);
    // JOV-6170: one identity = one opportunity with a Review count and
    // canonical directory drills (Genius / Last.fm / MusicBrainz).
    expect(
      screen.getByText('Add canonical @timwhite profile')
    ).toBeInTheDocument();
    expect(screen.getByText('Review 2')).toBeInTheDocument();
    expect(screen.getAllByTestId('canonical-source-drill')).toHaveLength(3);
    expect(
      screen
        .getAllByTestId('canonical-source-drill')
        .map(drill => drill.textContent)
    ).toEqual(['Genius', 'Last.fm', 'MusicBrainz']);
    expect(screen.getByTestId('suggested-connections-review')).toHaveClass(
      'min-w-0'
    );
    expect(
      screen.getAllByTestId('suggested-connection-row')[0]?.className
    ).toContain('justify-between');
    expect(screen.getByText('TikTok')).toBeInTheDocument();
    expect(screen.getByText('YouTube')).toBeInTheDocument();
    expect(screen.queryByText('Fan Wiki')).not.toBeInTheDocument();

    await user.click(
      within(screen.getByTestId('registered-header-actions')).getByRole(
        'button',
        { name: 'Add Profile Or Site' }
      )
    );
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    expect(panel).not.toBeNull();

    render(<TooltipProvider>{panel as ReactElement}</TooltipProvider>);
    expect(screen.getByText('Review Suggestions')).toBeInTheDocument();
    expect(
      screen.getByText('2 suggested profiles to review.')
    ).toBeInTheDocument();
  });

  it('renders one opportunity per identity with drills scoped to that identity', async () => {
    mockPersistedSuggestions([
      socialSuggestion('social-tiktok', 'tiktok', '@timwhite', 0.96),
      dspSuggestion('spotify-alpha', 'Alpha Artist', 0.89),
    ]);
    renderWorkspace(data);

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Suggested' }));

    expect(
      await screen.findByText('Add canonical Alpha Artist profile')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Add canonical @timwhite profile')
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('suggested-connection-group')).toHaveLength(2);
    expect(screen.getAllByText('Review 1')).toHaveLength(2);
    const drills = screen.getAllByTestId('canonical-source-drill');
    expect(drills).toHaveLength(6);
    expect(drills[0]).toHaveAttribute(
      'href',
      'https://genius.com/search?q=Alpha%20Artist'
    );
  });

  it('accepts a persisted suggestion, removes review actions, and shows a normal connection row', async () => {
    const user = userEvent.setup();
    mockPersistedSuggestions([
      socialSuggestion('social-tiktok', 'tiktok', '@timwhite', 0.96),
    ]);
    renderWorkspace(data);

    await user.click(screen.getByRole('button', { name: 'Suggested' }));
    expect(await screen.findByText('TikTok')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(
        vi
          .mocked(globalThis.fetch)
          .mock.calls.some(
            ([url, init]) =>
              String(url) ===
                '/api/suggestions/social-links/social-tiktok/approve' &&
              init?.method === 'POST' &&
              init.body === JSON.stringify({ profileId: data.profileId })
          )
      ).toBe(true)
    );
    await waitFor(() =>
      expect(
        screen.queryByTestId('suggested-connection-row')
      ).not.toBeInTheDocument()
    );
    await waitFor(() =>
      expect(screen.getByTestId('suggested-connections-review')).toHaveFocus()
    );
    expect(navigationMock.refresh).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /^Profiles$/ }));
    const acceptedRow = screen
      .getByRole('button', { name: 'Actions for TikTok' })
      .closest('tr');
    expect(acceptedRow).not.toBeNull();
    expect(
      within(acceptedRow as HTMLElement).getByRole('button', {
        name: 'Actions for TikTok',
      })
    ).toBeInTheDocument();
    expect(
      within(acceptedRow as HTMLElement).queryByRole('button', {
        name: 'Not me',
      })
    ).not.toBeInTheDocument();
  });

  it('rejects a persisted DSP suggestion from the keyboard and moves focus to the next action', async () => {
    const user = userEvent.setup();
    mockPersistedSuggestions([
      dspSuggestion('spotify-alpha', 'Alpha Artist', 0.89),
      socialSuggestion('social-beta', 'tiktok', '@beta', 0.84),
    ]);
    renderWorkspace(data);

    await user.click(screen.getByRole('button', { name: 'Suggested' }));
    expect(await screen.findByText('Alpha Artist')).toBeInTheDocument();

    const notMeButtons = screen.getAllByRole('button', { name: 'Not me' });
    notMeButtons[0]?.focus();
    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(
        vi
          .mocked(globalThis.fetch)
          .mock.calls.some(
            ([url, init]) =>
              String(url) === '/api/dsp/matches/spotify-alpha/reject' &&
              init?.method === 'POST' &&
              init.body === JSON.stringify({ profileId: data.profileId })
          )
      ).toBe(true)
    );
    expect(screen.queryByText('Alpha Artist')).not.toBeInTheDocument();
    expect(screen.getByText('@beta')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add' })).toHaveFocus()
    );
  });

  it('rolls back optimistic removal and restores focus when a suggestion mutation fails', async () => {
    const user = userEvent.setup();
    mockPersistedSuggestions(
      [socialSuggestion('social-tiktok', 'tiktok', '@timwhite', 0.96)],
      { failMutation: true }
    );
    renderWorkspace(data);

    await user.click(screen.getByRole('button', { name: 'Suggested' }));
    expect(await screen.findByText('TikTok')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not add. Try again.'
    );
    expect(screen.getByText('TikTok')).toBeInTheDocument();
    expect(navigationMock.refresh).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add' })).toHaveFocus()
    );
  });

  it('opens the persisted Suggested review queue from the legacy add service launch path', async () => {
    navigationMock.searchParams = new URLSearchParams('add=service');
    mockPersistedSuggestions([
      socialSuggestion('social-tiktok', 'tiktok', '@timwhite', 0.96),
    ]);
    renderWorkspace(data);

    expect(await screen.findByText('TikTok')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suggested' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(navigationMock.replace).toHaveBeenCalledWith('/app/profiles');
    expect(navigationMock.replace).not.toHaveBeenCalledWith(
      '/app/settings/connectors'
    );
  });

  it('exposes connector rows through a dedicated filter', async () => {
    const user = userEvent.setup();
    renderWorkspace(dataWithConnector);

    await user.click(screen.getByRole('button', { name: 'Connectors' }));

    expect(screen.getByText('Gmail')).toBeInTheDocument();
    expect(screen.queryByText('Spotify')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Actions for Instagram' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Jovie Profile')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connectors' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('uses the row action registry to open connection-specific details', async () => {
    const user = userEvent.setup();
    renderWorkspace(data);

    const action = screen.getByRole('button', {
      name: 'Actions for Spotify',
    });

    await user.click(action);
    await user.click(screen.getByRole('menuitem', { name: /View Details/i }));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    expect(panel).not.toBeNull();

    render(<TooltipProvider>{panel as ReactElement}</TooltipProvider>);
    expect(
      screen.getByRole('complementary', { name: 'Presence details' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('profiles-rail-entity-header')).toHaveClass(
      'relative',
      'flex'
    );
    expect(screen.getByTestId('profiles-rail-summary')).toBeInTheDocument();
    expect(
      screen.getByTestId('profiles-rail-shareable-link')
    ).toHaveTextContent('open.spotify.com/artist/tim');
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      'https://open.spotify.com/artist/tim'
    );
    // JOV-6170: separated signal primitives replace the merged next-best-action.
    expect(screen.getByTestId('presence-signal-finding')).toHaveTextContent(
      'Limit Reached'
    );
    expect(screen.getByText('Signals')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upgrade' })).toHaveAttribute(
      'href',
      '/app/settings/billing'
    );
  });

  it('uses the canonical Jovie URL only for supported social connections', async () => {
    const user = userEvent.setup();
    renderWorkspace(data);
    await user.click(screen.getByRole('button', { name: /^Profiles$/ }));

    const instagramRow = screen
      .getByRole('button', { name: 'Actions for Instagram' })
      .closest('tr');
    expect(
      within(instagramRow as HTMLElement).getByText('@tim')
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Actions for Instagram' })
    );
    await user.click(screen.getByRole('menuitem', { name: /View Details/i }));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    expect(panel).not.toBeNull();

    render(<TooltipProvider>{panel as ReactElement}</TooltipProvider>);
    expect(
      screen.getByTestId('profiles-rail-shareable-link')
    ).toHaveTextContent('jov.ie/tim/s/instagram');
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      'https://instagram.com/tim'
    );
  });

  it('opens a row action menu without selecting the row via pointer or keyboard', async () => {
    const user = userEvent.setup();
    renderWorkspace(data);

    const action = screen.getByRole('button', {
      name: 'Actions for Spotify',
    });

    vi.mocked(useRegisterRightPanel).mockClear();
    await user.click(action);

    expect(
      screen.getByRole('menuitem', { name: /View Details/i })
    ).toBeInTheDocument();
    expect(useRegisterRightPanel).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    vi.mocked(useRegisterRightPanel).mockClear();
    action.focus();
    await user.keyboard('{Enter}');

    expect(
      screen.getByRole('menuitem', { name: /View Details/i })
    ).toBeInTheDocument();
    expect(useRegisterRightPanel).not.toHaveBeenCalled();
  });

  it('uses the shared semantic, contextual action slot without shifting rows', () => {
    renderWorkspace(data);

    expect(
      within(screen.getByRole('columnheader', { name: 'Actions' })).getByText(
        'Actions'
      )
    ).toHaveClass('sr-only');

    const action = screen.getByRole('button', {
      name: 'Actions for Spotify',
    });
    expect(action.parentElement).not.toHaveClass('sm:opacity-0');
    expect(action.closest('td')).toHaveClass(
      'system-b-table-contextual-action-cell'
    );
  });

  it('clears connection details when the table filter changes', async () => {
    const user = userEvent.setup();
    renderWorkspace(data);

    await user.click(
      screen.getByRole('button', { name: 'Actions for Spotify' })
    );
    await user.click(screen.getByRole('menuitem', { name: /View Details/i }));
    expect(
      vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0]
    ).not.toBeNull();

    await user.click(screen.getByRole('button', { name: /^Profiles$/ }));
    expect(vi.mocked(useRegisterRightPanel)).toHaveBeenLastCalledWith(null);
  });

  it('adds monitored public pages without exposing account authorization', async () => {
    const user = userEvent.setup();
    renderWorkspace(data);

    await user.click(
      screen.getByRole('button', { name: 'Add Profile Or Site' })
    );
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    expect(panel).not.toBeNull();

    render(<TooltipProvider>{panel as ReactElement}</TooltipProvider>);
    expect(
      screen.getByRole('complementary', { name: 'Add Profile Or Site' })
    ).toBeInTheDocument();
    expect(screen.queryByText(/Connect services/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Gmail')).not.toBeInTheDocument();
    expect(screen.queryByText(/Google Calendar/i)).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /Add public profile/i })
    );
    const url = screen.getByRole('textbox', { name: 'Public Profile URL' });
    await user.type(url, 'Instagram.com/tim/?utm_source=test');
    expect(screen.getByText(/instagram\.com\/tim/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Review Profile' })
    ).toBeEnabled();
  });

  it('suggests handle destinations with keyboard selection and previews a temporary row', async () => {
    const user = userEvent.setup();
    renderWorkspace(data);

    await user.click(
      screen.getByRole('button', { name: 'Add Profile Or Site' })
    );
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    render(<TooltipProvider>{panel as ReactElement}</TooltipProvider>);

    await user.click(
      screen.getByRole('button', { name: /Add public profile/i })
    );
    const input = screen.getByRole('textbox', { name: 'Public Profile URL' });
    await user.type(input, '@newhandle');

    expect(
      screen.getByRole('listbox', { name: 'Suggested Profile Destinations' })
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /TikTok/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    await user.keyboard('{ArrowDown}{Enter}');
    expect(input).toHaveValue('https://youtube.com/@newhandle');
    expect(screen.getByText('Detected')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Review Profile' })
    ).toBeEnabled();

    expect(screen.getByText('Preview only · not saved')).toBeInTheDocument();

    const previewRow = screen
      .getByText('Preview only · not saved')
      .closest('tr');
    expect(previewRow).not.toBeNull();
    expect(
      within(previewRow as HTMLElement).queryByRole('button', {
        name: /Actions for/i,
      })
    ).not.toBeInTheDocument();

    vi.mocked(useRegisterRightPanel).mockClear();
    await user.click(previewRow as HTMLElement);
    expect(useRegisterRightPanel).not.toHaveBeenCalled();

    fireEvent.contextMenu(previewRow as HTMLElement);
    expect(screen.queryByText('No items found')).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('keeps secondary columns out of the selected-rail width contract', () => {
    renderWorkspace(data);

    expect(
      screen.getByRole('columnheader', { name: 'Search Rank' })
    ).toHaveClass('max-lg:hidden');
    expect(screen.getByRole('columnheader', { name: 'Change' })).toHaveClass(
      'max-xl:hidden'
    );
    expect(
      screen.getByRole('columnheader', { name: 'Monitoring' })
    ).toHaveClass('hidden', '2xl:table-cell');
    expect(screen.getByTestId('connections-workspace-toolbar')).toHaveClass(
      'min-h-10',
      'px-3',
      'py-1.5'
    );
    expect(
      screen.getByRole('columnheader', { name: 'Status' })
    ).toHaveTextContent('Status');
    expect(screen.queryByTestId('connections-toolbar-actions')).toBeNull();
  });

  it('keeps the final profile row reachable with its secondary line', () => {
    renderWorkspace(data);

    const table = screen.getByRole('table');
    expect(table.parentElement).toHaveClass(
      'overflow-auto',
      'min-h-0',
      'flex-1'
    );

    const finalRow = screen
      .getByRole('button', { name: 'Actions for Instagram' })
      .closest('tr');
    expect(finalRow).not.toBeNull();
    expect(
      within(finalRow as HTMLElement).getByText('@tim')
    ).toBeInTheDocument();
  });

  it('keeps generic OG images unverified and lock explanations keyboard-reachable', async () => {
    const user = userEvent.setup();
    renderWorkspace({
      ...data,
      rows: [
        ...data.rows,
        {
          id: 'seven-digital',
          rowType: 'surface',
          kind: 'dsp',
          platform: 'seven_digital',
          label: '7digital',
          handle: null,
          url: 'https://www.7digital.com/artist/tim-white',
          trackedUrl: null,
          qualificationStatus: 'qualified',
          isOfficial: true,
          monitoringState: 'active',
          rank: null,
          previousRank: null,
          lastObservedAt: '2026-07-16T00:00:00.000Z',
          identityPhoto: {
            url: 'https://www.7digital.com/og-card.jpg',
            source: 'public_metadata',
            kind: 'generic',
            verified: false,
            observedAt: '2026-07-16T00:00:00.000Z',
            freshness: 'current',
          },
        },
      ],
    });

    const photo = within(screen.getByRole('table')).getByRole('img', {
      name: /Unverified preview for Tim White on 7digital/i,
    });
    expect(photo).toHaveAttribute('data-photo-kind', 'generic');
    expect(photo).toHaveAttribute('data-photo-verified', 'false');

    const lock = screen.getAllByTestId('presence-lock')[0];
    lock?.focus();
    const explanation = await screen.findByTestId('presence-lock-explanation');
    expect(explanation).toHaveTextContent(
      'Upgrade required to monitor this page.'
    );
    await user.keyboard('{Tab}');
    expect(
      within(explanation).getByRole('link', { name: 'Upgrade' })
    ).toHaveAttribute('href', '/app/settings/billing');
  });
});
