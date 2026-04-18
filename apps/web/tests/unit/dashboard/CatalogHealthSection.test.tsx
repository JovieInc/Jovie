import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogHealthSection } from '@/features/dashboard/organisms/dsp-presence/CatalogHealthSection';

const { mockRefresh } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

let mockFetch: ReturnType<typeof vi.fn>;

const baseScan = {
  id: 'scan-1',
  creatorProfileId: 'profile-1',
  providerId: 'spotify',
  externalArtistId: 'spotify-artist-1',
  status: 'completed',
  catalogIsrcCount: 50,
  dspIsrcCount: 55,
  matchedCount: 47,
  unmatchedCount: 5,
  missingCount: 3,
  coveragePct: '94.00',
  albumsScanned: 10,
  tracksScanned: 55,
  error: null,
  startedAt: '2026-04-04T10:00:00Z',
  completedAt: '2026-04-04T10:00:30Z',
  createdAt: '2026-04-04T10:00:00Z',
};

const baseMismatch = {
  id: 'mismatch-1',
  scanId: 'scan-1',
  creatorProfileId: 'profile-1',
  isrc: 'USRC12345678',
  mismatchType: 'not_in_catalog' as const,
  externalTrackId: 'track-1',
  externalTrackName: 'Bad Love',
  externalAlbumName: 'Country Roads',
  externalAlbumId: 'album-1',
  externalArtworkUrl: null,
  externalArtistNames: 'Some Artist',
  status: 'flagged' as const,
  dismissedAt: null,
  dismissedReason: null,
  dedupKey: 'profile-1:USRC12345678:spotify',
  createdAt: '2026-04-04T10:00:00Z',
  updatedAt: '2026-04-04T10:00:00Z',
};

describe('CatalogHealthSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when no spotifyId', () => {
    const { container } = render(
      <CatalogHealthSection
        profileId='profile-1'
        spotifyId={null}
        hasUnresolvedMismatches={false}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders collapsed with "Catalog Health" header when no prior scan', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ scan: null, mismatches: [] }),
    });

    render(
      <CatalogHealthSection
        profileId='profile-1'
        spotifyId='spotify-1'
        hasUnresolvedMismatches={false}
      />
    );

    expect(screen.getByText('Catalog Health')).toBeInTheDocument();
  });

  it('auto-expands when hasUnresolvedMismatches is true', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          scan: baseScan,
          mismatches: [baseMismatch],
        }),
    });

    render(
      <CatalogHealthSection
        profileId='profile-1'
        spotifyId='spotify-1'
        hasUnresolvedMismatches={true}
      />
    );

    // Section should auto-expand and show loading, then cards
    await waitFor(() => {
      expect(screen.getByText('Bad Love')).toBeInTheDocument();
    });
  });

  it('shows "Scan Catalog" CTA when section is opened and never scanned', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ scan: null, mismatches: [] }),
    });

    const user = userEvent.setup();
    render(
      <CatalogHealthSection
        profileId='profile-1'
        spotifyId='spotify-1'
        hasUnresolvedMismatches={false}
      />
    );

    // Click to open
    await user.click(screen.getByText('Catalog Health'));

    await waitFor(() => {
      expect(screen.getByText('Scan Catalog')).toBeInTheDocument();
    });
  });

  it('shows "All clear" with coverage when no mismatches', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          scan: baseScan,
          mismatches: [],
        }),
    });

    const user = userEvent.setup();
    render(
      <CatalogHealthSection
        profileId='profile-1'
        spotifyId='spotify-1'
        hasUnresolvedMismatches={false}
      />
    );

    // Header should show "All clear" after load
    // Need to open section first
    await user.click(screen.getByRole('button', { expanded: false }));

    await waitFor(() => {
      expect(screen.getByText(/94\.00% coverage/)).toBeInTheDocument();
    });
  });

  it('shows mismatch cards for not_in_catalog items', async () => {
    const mismatches = [
      baseMismatch,
      {
        ...baseMismatch,
        id: 'mismatch-2',
        externalTrackName: 'Another Song',
        dedupKey: 'profile-1:USRC99999999:spotify',
        isrc: 'USRC99999999',
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          scan: baseScan,
          mismatches,
        }),
    });

    render(
      <CatalogHealthSection
        profileId='profile-1'
        spotifyId='spotify-1'
        hasUnresolvedMismatches={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Bad Love')).toBeInTheDocument();
      expect(screen.getByText('Another Song')).toBeInTheDocument();
    });
  });

  it('shows info row for missing_from_dsp items separately', async () => {
    const mismatches = [
      baseMismatch,
      {
        ...baseMismatch,
        id: 'mismatch-missing',
        mismatchType: 'missing_from_dsp' as const,
        externalTrackName: 'My Missing Track',
        dedupKey: 'profile-1:USRC11111111:spotify',
        isrc: 'USRC11111111',
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          scan: baseScan,
          mismatches,
        }),
    });

    render(
      <CatalogHealthSection
        profileId='profile-1'
        spotifyId='spotify-1'
        hasUnresolvedMismatches={true}
      />
    );

    await waitFor(() => {
      // The not_in_catalog one shows as a card
      expect(screen.getByText('Bad Love')).toBeInTheDocument();
      // The missing_from_dsp one shows as info text, not a card
      expect(
        screen.getByText(/1 track in your catalog isn't on Spotify yet/)
      ).toBeInTheDocument();
    });
  });

  it('shows post-triage summary with Spotify link after resolving all cards', async () => {
    mockFetch
      // Initial load
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            scan: baseScan,
            mismatches: [baseMismatch],
          }),
      })
      // PATCH call
      .mockResolvedValueOnce({ ok: true });

    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <CatalogHealthSection
        profileId='profile-1'
        spotifyId='spotify-1'
        hasUnresolvedMismatches={true}
      />
    );

    // Wait for card to load
    await waitFor(() => {
      expect(screen.getByText('Bad Love')).toBeInTheDocument();
    });

    // Click "Not Mine"
    await user.click(screen.getByText('Not Mine'));

    // Advance past undo delay
    vi.advanceTimersByTime(3000);

    // Wait for PATCH and removal
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/dsp/catalog-scan/mismatches/mismatch-1',
        expect.objectContaining({ method: 'PATCH' })
      );
    });

    // Advance past animation
    vi.advanceTimersByTime(300);

    // Post-triage summary should appear
    await waitFor(() => {
      expect(
        screen.getByText(/You flagged 1 track as not yours/)
      ).toBeInTheDocument();
      expect(
        screen.getByText('Report to Spotify for Artists →')
      ).toBeInTheDocument();
    });

    vi.useRealTimers();
  });

  it('triggers scan when Scan Catalog button is clicked', async () => {
    // Initial load — no scan
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ scan: null, mismatches: [] }),
    });

    const user = userEvent.setup();
    render(
      <CatalogHealthSection
        profileId='profile-1'
        spotifyId='spotify-1'
        hasUnresolvedMismatches={false}
      />
    );

    await user.click(screen.getByText('Catalog Health'));

    await waitFor(() => {
      expect(screen.getByText('Scan Catalog')).toBeInTheDocument();
    });

    // Mock the scan trigger response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          scanId: 'new-scan',
          status: 'pending',
        }),
    });

    await user.click(screen.getByText('Scan Catalog'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/dsp/catalog-scan',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('backs off catalog scan polling after the initial fast window', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/api/dsp/catalog-scan/results')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ scan: null, mismatches: [] }),
        });
      }

      if (url === '/api/dsp/catalog-scan') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              scanId: 'new-scan',
              status: 'pending',
            }),
        });
      }

      if (url.includes('/api/dsp/catalog-scan/status?scanId=new-scan')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              scan: { status: 'pending' },
            }),
        });
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    render(
      <CatalogHealthSection
        profileId='profile-1'
        spotifyId='spotify-1'
        hasUnresolvedMismatches={false}
      />
    );

    await user.click(screen.getByText('Catalog Health'));

    await waitFor(() => {
      expect(screen.getByText('Scan Catalog')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Scan Catalog'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/dsp/catalog-scan/status?scanId=new-scan'
      );
    });

    const getStatusCallCount = () =>
      mockFetch.mock.calls.filter(([input]) =>
        String(input).includes('/api/dsp/catalog-scan/status?scanId=new-scan')
      ).length;

    expect(getStatusCallCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(2_000);
    await waitFor(() => {
      expect(getStatusCallCount()).toBe(2);
    });

    await vi.advanceTimersByTimeAsync(2_000);
    await waitFor(() => {
      expect(getStatusCallCount()).toBe(3);
    });

    await vi.advanceTimersByTimeAsync(2_000);
    await waitFor(() => {
      expect(getStatusCallCount()).toBe(4);
    });

    await vi.advanceTimersByTimeAsync(4_000);

    expect(getStatusCallCount()).toBe(4);

    await vi.advanceTimersByTimeAsync(1_000);

    await waitFor(() => {
      expect(getStatusCallCount()).toBe(5);
    });

    vi.useRealTimers();
  });
});
