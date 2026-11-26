import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DmQueuePanel } from './DmQueuePanel';

const toastError = vi.hoisted(() => vi.fn());

vi.mock('@/components/feedback', () => ({
  toast: { error: toastError, success: vi.fn() },
}));

vi.mock('./DmQueueCard', () => ({
  DmQueueCard: ({
    lead,
    onMarkedSent,
  }: {
    lead: { displayName: string | null };
    onMarkedSent: () => void;
  }) => (
    <button type='button' onClick={onMarkedSent}>
      {lead.displayName}
    </button>
  ),
}));

const queue = (items: unknown[]) =>
  Promise.resolve(
    new Response(JSON.stringify({ items, total: items.length }), {
      status: 200,
    })
  );

describe('DmQueuePanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    toastError.mockReset();
  });

  it('shows the empty message when the queue has no leads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => queue([]))
    );
    const { container } = render(<DmQueuePanel />);
    expect(await screen.findByText('No leads in DM queue')).toBeInTheDocument();
    expect(screen.getByText('0 queued')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders leads and refetches when one is marked sent', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(() =>
      queue([{ id: 'a', displayName: 'Ada', outreachStatus: 'queued' }])
    );
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<DmQueuePanel />);
    const card = await screen.findByRole('button', { name: 'Ada' });
    expect(screen.getByText('1 queued')).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await user.click(card);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('reports a failed load with a toast and leaves the empty state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 500 })))
    );
    const { container } = render(<DmQueuePanel />);
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Failed to load DM queue')
    );
    expect(await screen.findByText('No leads in DM queue')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('holds the spinner while the request is pending', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined))
    );
    const { container } = render(<DmQueuePanel />);
    expect(screen.queryByText('No leads in DM queue')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
