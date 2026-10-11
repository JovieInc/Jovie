import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MetadataAgentPanel } from './MetadataAgentPanel';

const PALETTE = /\b(?:bg|text|border)-(?:red|amber|emerald)-\d{2,3}\b/;

function baseRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    providerId: 'xperi_allmusic_email',
    status: 'draft',
    createdAt: '2026-09-20T00:00:00.000Z',
    approvedAt: null,
    sentAt: null,
    latestSnapshotAt: null,
    providerMessageId: null,
    lastError: null,
    missingFields: [],
    issues: [],
    targets: [],
    ...overrides,
  };
}

function mockPanelFetch(status: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok,
      json: async () =>
        url.includes('/providers') ? { providers: [] } : status,
    }))
  );
}

function renderPanel() {
  return render(
    <MetadataAgentPanel
      profileId='profile-1'
      releaseId='release-1'
      releaseTitle='Midnight Drive'
    />
  );
}

describe('MetadataAgentPanel status callouts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a load failure on the error status token', async () => {
    mockPanelFetch({}, false);
    renderPanel();

    const error = await screen.findByText(
      'Unable to load metadata agent state.'
    );
    expect(error).toHaveClass('bg-error-subtle', 'text-error');
    expect(error.className).not.toMatch(PALETTE);
  });

  it('shows unavailable storage on the warning status token', async () => {
    mockPanelFetch({ storageAvailable: false, requests: [] });
    renderPanel();

    const warning = await screen.findByText(
      'Metadata submission storage is not available in this environment.'
    );
    expect(warning).toHaveClass('bg-warning-subtle', 'text-warning');
    expect(warning.className).not.toMatch(PALETTE);
  });

  it('lists missing fields inside a warning callout', async () => {
    mockPanelFetch({
      requests: [
        baseRequest({
          missingFields: [{ field: 'isrc', reason: 'Required by provider' }],
        }),
      ],
    });
    renderPanel();

    const heading = await screen.findByText('Missing Fields');
    expect(heading).toHaveClass('text-warning');
    expect(heading.parentElement).toHaveClass('bg-warning-subtle');
    expect(heading.parentElement?.className).not.toMatch(PALETTE);
  });

  it('confirms a clean live snapshot on the success token', async () => {
    mockPanelFetch({
      requests: [baseRequest({ status: 'live', lastError: 'Bounce once' })],
    });
    renderPanel();

    expect(
      await screen.findByText('No open drift issues on the latest snapshot.')
    ).toHaveClass('text-success');
    expect(screen.getByText('Bounce once')).toHaveClass('text-error');
  });
});
