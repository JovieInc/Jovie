import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const mocks = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock('@/components/feedback', () => ({
  toast: { error: mocks.toastError, success: vi.fn() },
}));
// The card is certified on its own; a stand-in keeps this test on the panel's
// fetch, states and its reload-after-send callback.
vi.mock('./DmQueueCard', () => ({
  DmQueueCard: ({
    lead,
    onMarkedSent,
  }: {
    readonly lead: { readonly id: string; readonly displayName: string | null };
    readonly onMarkedSent: () => void;
  }) => (
    <article data-testid={`dm-card-${lead.id}`}>
      <p>{lead.displayName}</p>
      <button type='button' onClick={onMarkedSent}>
        Mark {lead.displayName} sent
      </button>
    </article>
  ),
}));

import { DmQueuePanel } from './DmQueuePanel';

const fetchMock = vi.fn<typeof fetch>();

function lead(id: string, displayName: string) {
  return {
    id,
    displayName,
    instagramHandle: displayName.toLowerCase(),
    priorityScore: 82,
    dmCopy: `Hey ${displayName}, your page is ready.`,
    outreachStatus: 'queued',
  };
}

function queue(items: unknown[], total = items.length) {
  return new Response(JSON.stringify({ items, total }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('DmQueuePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('asks for the DM queue by priority and shows a spinner meanwhile', async () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));
    const { container } = render(<DmQueuePanel />);

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://x');
    expect(url.pathname).toBe('/api/admin/outreach');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      queue: 'dm',
      sort: 'priorityScore',
      sortOrder: 'desc',
      limit: '50',
    });
    expect(screen.getByText('DM queue')).toBeInTheDocument();
    expect(screen.getByText('0 queued')).toBeInTheDocument();
    expect(screen.queryByText('No leads in DM queue')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('says the queue is empty', async () => {
    fetchMock.mockResolvedValue(queue([]));
    const { container } = render(<DmQueuePanel />);
    expect(await screen.findByText('No leads in DM queue')).toBeInTheDocument();
    expect(mocks.toastError).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('lists a card per lead with the server total', async () => {
    fetchMock.mockResolvedValue(
      queue([lead('1', 'Ada'), lead('2', 'Bea')], 128)
    );
    const { container } = render(<DmQueuePanel />);
    expect(await screen.findByTestId('dm-card-1')).toHaveTextContent('Ada');
    expect(screen.getByTestId('dm-card-2')).toHaveTextContent('Bea');
    expect(screen.getByText('128 queued')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('reloads the queue after a lead is marked sent', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(queue([lead('1', 'Ada'), lead('2', 'Bea')]))
      .mockResolvedValueOnce(queue([lead('2', 'Bea')]));
    render(<DmQueuePanel />);

    await user.click(
      await screen.findByRole('button', { name: 'Mark Ada sent' })
    );
    expect(await screen.findByText('1 queued')).toBeInTheDocument();
    expect(screen.queryByTestId('dm-card-1')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('toasts and settles on the empty line when the server fails', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 500 }));
    const { container } = render(<DmQueuePanel />);
    expect(await screen.findByText('No leads in DM queue')).toBeInTheDocument();
    expect(mocks.toastError).toHaveBeenCalledWith('Failed to load DM queue');
    await expectNoA11yViolations(container);
  });

  it('toasts the same way when offline, inside a right-to-left document', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { container } = render(
      <div dir='rtl'>
        <DmQueuePanel />
      </div>
    );
    expect(await screen.findByText('No leads in DM queue')).toBeInTheDocument();
    expect(mocks.toastError).toHaveBeenCalledWith('Failed to load DM queue');
    await expectNoA11yViolations(container);
  });
});
