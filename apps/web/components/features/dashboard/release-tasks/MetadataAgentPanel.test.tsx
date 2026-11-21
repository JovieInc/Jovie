import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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
    expect(error).toHaveClass('bg-error-subtle', 'text-error-text');
    expect(error.className).not.toMatch(PALETTE);
  });

  it('shows unavailable storage on the warning status token', async () => {
    mockPanelFetch({ storageAvailable: false, requests: [] });
    renderPanel();

    const warning = await screen.findByText(
      'Metadata submission storage is not available in this environment.'
    );
    expect(warning).toHaveClass('bg-warning-subtle', 'text-warning-text');
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
    expect(heading).toHaveClass('text-warning-text');
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
    ).toHaveClass('text-success-text');
    expect(screen.getByText('Bounce once')).toHaveClass('text-error-text');
  });
  it('prepares a package with a POST and rebuilds from the status', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      async (url: string, init?: { method?: string }) => ({
        ok: true,
        json: async () => {
          if (url.includes('/providers')) return { providers: [] };
          if (url.includes('/prepare')) return { success: true };
          return { requests: [] };
        },
        init,
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderPanel();

    const prepare = await screen.findByRole('button', {
      name: 'Prepare Package',
    });
    await waitFor(() => expect(prepare).toBeEnabled());
    await user.click(prepare);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/metadata-submissions/prepare',
        expect.objectContaining({ method: 'POST' })
      )
    );
    await expectNoA11yViolations(container);
  });

  it('approves and sends an awaiting package', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => {
        if (url.includes('/providers')) return { providers: [] };
        if (url.includes('/approve-send')) return { success: true };
        return { requests: [baseRequest({ status: 'awaiting_approval' })] };
      },
    }));
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();

    const approve = await screen.findByRole('button', {
      name: 'Approve And Send',
    });
    await waitFor(() => expect(approve).toBeEnabled());
    await user.click(approve);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/metadata-submissions/approve-send',
        expect.objectContaining({ method: 'POST' })
      )
    );
  });

  it('drafts a correction for open drift issues and shows a failure', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url: string) => ({
      ok: !url.includes('/draft-correction'),
      json: async () => {
        if (url.includes('/providers')) return { providers: [] };
        if (url.includes('/draft-correction')) {
          return { success: false, error: 'Draft failed.' };
        }
        return {
          requests: [
            baseRequest({
              status: 'live',
              issues: [
                {
                  id: 'i1',
                  field: 'title',
                  issueType: 'mismatch',
                  severity: 'high',
                  expectedValue: 'A',
                  observedValue: 'B',
                  status: 'open',
                },
              ],
            }),
          ],
        };
      },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderPanel();

    const draft = await screen.findByRole('button', {
      name: 'Draft Correction',
    });
    await waitFor(() => expect(draft).toBeEnabled());
    await user.click(draft);
    expect(await screen.findByText('Draft failed.')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
