import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));
vi.stubGlobal('fetch', fetchMock);
vi.mock('@/components/feedback', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/queries', () => ({
  useMarkLeadDmSentMutation: () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
}));

import { DmQueuePanel } from './DmQueuePanel';

const lead = {
  id: 'lead-1',
  displayName: 'River Lane',
  instagramHandle: 'riverlane',
  priorityScore: 80,
  dmCopy: 'Claim your page',
  outreachStatus: 'pending',
  completenessEligible: false,
};

function mockQueueResponse(items: (typeof lead)[], total = items.length) {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ items, total }),
  });
}

describe('DmQueuePanel', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the queue header with the total count', async () => {
    mockQueueResponse([lead]);
    render(<DmQueuePanel />);
    expect(
      screen.getByRole('heading', { name: 'DM queue' })
    ).toBeInTheDocument();
    expect(await screen.findByText('1 queued')).toBeInTheDocument();
    expect(
      screen.getByText('Profile review is required before outreach.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy DM' })).toBeDisabled();
  });

  it('shows the empty state when no leads are queued', async () => {
    mockQueueResponse([]);
    render(<DmQueuePanel />);
    expect(await screen.findByText('No leads in DM queue')).toBeInTheDocument();
  });
});
