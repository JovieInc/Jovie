import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SummerCardReviewPanel } from '@/components/features/admin/summer-cards/SummerCardReviewPanel';
import { toast } from '@/components/feedback';
import type { SummerCard } from '@/lib/ovie/summer-cards';

vi.mock('@/components/feedback', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
}

function card(overrides: Partial<SummerCard>): SummerCard {
  return {
    id: 'sc_0123456789abcdef0123456789abcdef',
    idempotencyKey: 'outbound-0001',
    kind: 'outbound',
    product: 'jov',
    title: 'Email 12 claimed artists',
    body: 'Draft body for the outbound send.',
    recommendation: 'Send it',
    defaultIfSilent: null,
    recipient: 'claimed artists',
    amountUsd: null,
    evidence: ['https://example.com/list'],
    status: 'pending',
    comment: null,
    createdAt: '2026-09-06T10:00:00.000Z',
    decidedAt: null,
    ...overrides,
  };
}

describe('SummerCardReviewPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders card detail and posts approve to the decision endpoint', async () => {
    const spendCard = card({ amountUsd: 400 });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ cards: [spendCard], pendingCount: 1 })
      )
      .mockResolvedValueOnce(jsonResponse({ card: spendCard }));
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<SummerCardReviewPanel />);

    const cardEl = await screen.findByTestId(`summer-card-${spendCard.id}`);
    expect(cardEl).toHaveTextContent('Email 12 claimed artists');
    expect(cardEl).toHaveTextContent('Draft body for the outbound send.');
    expect(cardEl).toHaveTextContent('claimed artists');
    expect(cardEl).toHaveTextContent('$400');
    expect(
      within(cardEl).getByRole('link', { name: /example\.com\/list/ })
    ).toHaveAttribute('href', 'https://example.com/list');
    expect(screen.getByTestId('summer-cards-pending-count')).toHaveTextContent(
      '1'
    );

    await user.click(within(cardEl).getByRole('button', { name: 'Approve' }));

    await waitFor(() => {
      expect(
        screen.queryByTestId(`summer-card-${spendCard.id}`)
      ).not.toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `/api/ovie/summer-cards/${spendCard.id}/decision`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ decision: 'approve' }),
      })
    );
    expect(screen.getByText('No pending Summer cards.')).toBeInTheDocument();
  });

  it('records a comment with the decision from the comment dialog', async () => {
    const target = card({});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ cards: [target], pendingCount: 1 }))
      .mockResolvedValueOnce(jsonResponse({ card: target }));
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<SummerCardReviewPanel />);

    const cardEl = await screen.findByTestId(`summer-card-${target.id}`);
    await user.click(within(cardEl).getByRole('button', { name: 'Comment' }));

    const dialog = await screen.findByRole('dialog', {
      name: 'Summer Card Comment',
    });
    await user.type(
      within(dialog).getByPlaceholderText('Add a comment for this decision'),
      'Cut the second paragraph.'
    );
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        `/api/ovie/summer-cards/${target.id}/decision`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            decision: 'reject',
            comment: 'Cut the second paragraph.',
          }),
        })
      );
    });
  });

  it('drops the card when the server reports the decision is already final', async () => {
    const target = card({});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ cards: [target], pendingCount: 1 }))
      .mockResolvedValueOnce(
        jsonResponse(
          { error: 'already_decided', card: { ...target, status: 'approved' } },
          { status: 409 }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<SummerCardReviewPanel />);

    const cardEl = await screen.findByTestId(`summer-card-${target.id}`);
    await user.click(within(cardEl).getByRole('button', { name: 'Approve' }));

    await waitFor(() => {
      expect(
        screen.queryByTestId(`summer-card-${target.id}`)
      ).not.toBeInTheDocument();
    });
    expect(toast.error).toHaveBeenCalledWith(
      'This card was already decided. Refreshing the inbox.'
    );
  });

  it('shows an actionable error and retry when listing fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ error: 'forbidden' }, { status: 403 })
      )
      .mockResolvedValueOnce(jsonResponse({ cards: [], pendingCount: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<SummerCardReviewPanel />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Admin Access Required');

    await user.click(
      screen.getByRole('button', { name: 'Retry Summer Cards' })
    );
    expect(
      await screen.findByText('No pending Summer cards.')
    ).toBeInTheDocument();
  });
});
