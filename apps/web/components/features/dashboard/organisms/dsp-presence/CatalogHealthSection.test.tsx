import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CatalogHealthSection } from './CatalogHealthSection';
import type { CatalogMismatch, CatalogScan } from './types';

vi.mock('@/components/feedback', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const profileId = '00000000-0000-4000-8000-000000000001';
const spotifyId = 'a'.repeat(22);

const scan: CatalogScan = {
  id: 'scan-1',
  status: 'completed',
  matchedCount: 12,
  catalogIsrcCount: 12,
  coveragePct: '100.00',
  albumsScanned: 2,
  tracksScanned: 12,
  error: null,
  completedAt: null,
};

const missing: CatalogMismatch = {
  id: 'mismatch-1',
  scanId: 'scan-1',
  creatorProfileId: profileId,
  isrc: 'USAAA2600001',
  mismatchType: 'missing_from_dsp',
  externalTrackId: null,
  externalTrackName: null,
  externalAlbumName: null,
  externalAlbumId: null,
  externalArtworkUrl: null,
  externalArtistNames: null,
  status: 'flagged',
  dismissedAt: null,
  dismissedReason: null,
  dedupKey: 'dedup-1',
  createdAt: '2026-10-14T00:00:00Z',
  updatedAt: '2026-10-14T00:00:00Z',
};

function mockResults(body: unknown) {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('CatalogHealthSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders nothing without a Spotify id', () => {
    const { container } = render(
      <CatalogHealthSection
        profileId={profileId}
        spotifyId={null}
        hasUnresolvedMismatches={false}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('expands from its header and offers a first scan', async () => {
    const user = userEvent.setup();
    const fetchMock = mockResults({ scan: null, mismatches: [] });
    const { container } = render(
      <CatalogHealthSection
        profileId={profileId}
        spotifyId={spotifyId}
        hasUnresolvedMismatches={false}
      />
    );

    const header = screen.getByRole('button', { name: /Catalog Health/ });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(
      await screen.findByRole('button', { name: 'Scan Catalog' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows the all-clear summary and a re-scan action', async () => {
    mockResults({ scan, mismatches: [] });
    const { container } = render(
      <CatalogHealthSection
        profileId={profileId}
        spotifyId={spotifyId}
        hasUnresolvedMismatches
      />
    );

    expect(
      await screen.findByRole('button', { name: /All clear — 12 ISRCs/ })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-scan' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows a failed scan and retries it', async () => {
    const user = userEvent.setup();
    const fetchMock = mockResults({
      scan: { ...scan, status: 'failed', error: 'Spotify is unavailable.' },
      mismatches: [],
    });
    const { container } = render(
      <CatalogHealthSection
        profileId={profileId}
        spotifyId={spotifyId}
        hasUnresolvedMismatches
      />
    );

    expect(await screen.findByText('Spotify is unavailable.')).toBeVisible();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/dsp/catalog-scan',
        expect.objectContaining({ method: 'POST' })
      )
    );
  });

  it('notes tracks that were not observed in the scanned catalog', async () => {
    mockResults({ scan, mismatches: [missing] });
    const { container } = render(
      <CatalogHealthSection
        profileId={profileId}
        spotifyId={spotifyId}
        hasUnresolvedMismatches
      />
    );

    expect(
      await screen.findByText(/Spotify availability is unverified/)
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
