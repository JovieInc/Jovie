import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  inboxItemFromDesignProposal,
  inboxItemFromSummerCard,
  type OvieInboxResponse,
} from '@/lib/ovie/inbox';
import { designProposal, summerCard } from '@/tests/fixtures/ovie-inbox';
import { OvieInbox } from './OvieInbox';

const mocks = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/components/feedback', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  usePathname: () => '/app/ov/inbox',
}));
// Capture the registered rail so its content is assertable without the shell.
const rail = vi.hoisted(() => ({ panel: null as unknown }));
vi.mock('@/hooks/useRegisterRightPanel', () => ({
  useRegisterRightPanel: (panel: unknown) => {
    rail.panel = panel;
  },
}));

const spendCard = inboxItemFromSummerCard(summerCard());
const tasteCard = inboxItemFromDesignProposal(designProposal());

function inbox(overrides: Partial<OvieInboxResponse> = {}): OvieInboxResponse {
  return {
    pending: [tasteCard, spendCard],
    decided: [],
    sources: { summer: 'ok', 'design-lab': 'ok' },
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderInbox(
  props: Partial<Parameters<typeof OvieInbox>[0]> = {},
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
) {
  return render(
    <QueryClientProvider client={client}>
      <OvieInbox view='pending' initialData={inbox()} {...props} />
    </QueryClientProvider>
  );
}

const fetchMock = vi.fn();

describe('OvieInbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('shows a loading skeleton with the same row geometry as cards', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderInbox({ initialData: null });
    const skeleton = screen.getByLabelText('Loading Inbox');
    const rowClasses = [...skeleton.querySelectorAll('li')].map(
      li => li.className
    );
    expect(rowClasses.every(className => className.includes('h-11'))).toBe(
      true
    );
  });

  it('shows Inbox zero when nothing is pending', () => {
    renderInbox({ initialData: inbox({ pending: [] }) });
    expect(screen.getByTestId('ovie-inbox-empty')).toHaveTextContent(
      'Inbox zero'
    );
  });

  it('shows a retryable error when the inbox cannot load', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'x' }), { status: 503 })
    );
    renderInbox({ initialData: null });
    // The hook retries once before surfacing the error.
    expect(
      await screen.findByTestId('ovie-inbox-error', {}, { timeout: 4000 })
    ).toBeInTheDocument();
  });

  it('names a degraded source instead of showing zero', () => {
    renderInbox({
      initialData: inbox({ sources: { summer: 'error', 'design-lab': 'ok' } }),
    });
    expect(screen.getByTestId('ovie-inbox-degraded')).toHaveTextContent(
      'Summer cards did not load'
    );
  });

  it('renders every pending card at one row height, newest selected', () => {
    renderInbox();
    const rows = screen.getAllByTestId('ovie-inbox-row');
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.className.includes('h-11'))).toBe(true);
    expect(rows[0]).toHaveAttribute('aria-current', 'true');
  });

  it('moves with J and approves the selected Summer card with A', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ card: {} }), { status: 200 })
    );
    renderInbox();

    fireEvent.keyDown(document, { key: 'j' });
    expect(screen.getAllByTestId('ovie-inbox-row')[1]).toHaveAttribute(
      'aria-current',
      'true'
    );

    fireEvent.keyDown(document, { key: 'a' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      '/api/ovie/summer-cards/sc_00000000000000000000000000000001/decision'
    );
    expect(JSON.parse(init.body)).toEqual({ decision: 'approve' });
    await waitFor(() =>
      expect(screen.getAllByTestId('ovie-inbox-row')).toHaveLength(1)
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Approved.');
  });

  it('shows every decision field of the selected card in the right rail', () => {
    renderInbox({ initialData: inbox({ pending: [spendCard] }) });
    render(rail.panel as ReactElement);
    const detail = screen.getByTestId('ovie-inbox-detail');
    expect(detail).toHaveTextContent('Approve the renewal.');
    expect(detail).toHaveTextContent(
      'If you stay silent: Seats lapse on Friday.'
    );
    expect(detail).toHaveTextContent('Linear');
    expect(detail).toHaveTextContent('$16');
    expect(
      screen.getByRole('link', { name: /linear\.app\/billing/ })
    ).toHaveAttribute('href', 'https://linear.app/billing');
    // Flat sections: no disclosure toggles (menus are not disclosures).
    expect(
      detail.querySelector('[aria-expanded]:not([aria-haspopup])')
    ).toBeNull();
  });

  it('asks for direction before rejecting a taste proposal', async () => {
    renderInbox();
    fireEvent.keyDown(document, { key: 'r' });
    expect(await screen.findByTestId('ovie-inbox-comment')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the card and says so when a decision fails', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 500 }));
    renderInbox();
    fireEvent.keyDown(document, { key: 'j' });
    fireEvent.keyDown(document, { key: 'a' });
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(screen.getAllByTestId('ovie-inbox-row')).toHaveLength(2);
  });

  it('ignores shortcuts while typing', () => {
    renderInbox();
    const input = document.createElement('input');
    document.body.append(input);
    fireEvent.keyDown(input, { key: 'a' });
    expect(fetchMock).not.toHaveBeenCalled();
    input.remove();
  });

  it('approves a Summer card on a touch swipe right', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    renderInbox();
    const row = screen.getAllByTestId('ovie-inbox-row')[1];
    fireEvent.pointerDown(row, { pointerType: 'touch', clientX: 10 });
    fireEvent.pointerMove(row, { pointerType: 'touch', clientX: 140 });
    fireEvent.pointerUp(row, { pointerType: 'touch', clientX: 140 });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      decision: 'approve',
    });
  });
});
