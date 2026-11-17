import { TooltipProvider } from '@jovie/ui';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/components/feedback', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

import { ReviewQueuePanel } from './ReviewQueuePanel';

const LOAD_ERROR =
  'We could not load the manual review queue right now. Please try again shortly.';
const LONG_NAME =
  'Aurelia Montgomery-Fitzgerald and the Extraordinarily Long Named Midnight Orchestra';

const fetchMock = vi.fn<typeof fetch>();

function lead(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    displayName: 'Ada',
    contactEmail: 'ada@example.com',
    instagramHandle: 'ada',
    priorityScore: 82,
    fitScore: 55,
    outreachStatus: 'pending_review',
    signals: { emailSuspicious: true },
    ...overrides,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function queue(items: unknown[], total = items.length, page = 1) {
  return json({ items, total, page, limit: 50 });
}

function requestUrl(call: number) {
  return new URL(String(fetchMock.mock.calls[call]?.[0]), 'http://x');
}

function renderPanel(dir?: 'rtl') {
  return render(
    <TooltipProvider>
      <div dir={dir}>
        <ReviewQueuePanel />
      </div>
    </TooltipProvider>
  );
}

describe('ReviewQueuePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('asks for the manual review queue and keeps its header while loading', async () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));
    const { container } = renderPanel();
    expect(requestUrl(0).pathname).toBe('/api/admin/outreach');
    expect(Object.fromEntries(requestUrl(0).searchParams)).toEqual({
      queue: 'manual_review',
      sort: 'priorityScore',
      sortOrder: 'desc',
      page: '1',
      limit: '50',
    });
    expect(screen.getByText('Manual review')).toBeInTheDocument();
    expect(screen.getByText('0 queued')).toBeInTheDocument();
    expect(screen.queryByText('No leads pending')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('says nothing is pending when the queue is empty', async () => {
    fetchMock.mockResolvedValue(queue([]));
    const { container } = renderPanel();
    expect(await screen.findByText('No leads pending')).toBeInTheDocument();
    expect(screen.getByText('No leads pending review')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next Page' })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('names a failed request in the table', async () => {
    fetchMock.mockResolvedValue(json({ error: 'nope' }, 500));
    const { container } = renderPanel();
    expect(
      await screen.findByText('Unable to load manual review')
    ).toBeInTheDocument();
    expect(screen.getByText(LOAD_ERROR)).toBeInTheDocument();
    expect(screen.getByText('0 queued')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('names the same failure when offline', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    renderPanel();
    expect(await screen.findByText(LOAD_ERROR)).toBeInTheDocument();
  });

  it('shows each lead with its signals and an Instagram link', async () => {
    fetchMock.mockResolvedValue(
      queue([
        lead({
          displayName: LONG_NAME,
          signals: {
            emailSuspicious: true,
            emailInvalid: true,
            hasRepresentation: true,
          },
        }),
      ])
    );
    const { container } = renderPanel();
    expect(await screen.findByText(LONG_NAME)).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '@ada' })).toHaveAttribute(
      'href',
      'https://instagram.com/ada'
    );
    for (const signal of [
      'Suspicious Email',
      'Invalid Email',
      'Has Representation',
    ]) {
      expect(screen.getByText(signal)).toBeInTheDocument();
    }
    expect(screen.getByText('1 queued')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows dashes for a lead with missing fields', async () => {
    fetchMock.mockResolvedValue(
      queue([
        lead({
          displayName: null,
          contactEmail: null,
          instagramHandle: null,
          priorityScore: null,
          fitScore: null,
          signals: {},
        }),
      ])
    );
    const { container } = renderPanel('rtl');
    const skip = await screen.findByRole('button', { name: 'Skip' });
    const row = skip.closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getAllByText('-')).toHaveLength(5);
    expect(screen.queryByRole('link')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('skips a lead, confirms it and reloads the queue', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(queue([lead()]))
      .mockResolvedValueOnce(json({ ok: true }))
      .mockResolvedValueOnce(queue([]));
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Skip' }));
    expect(await screen.findByText('No leads pending')).toBeInTheDocument();
    expect(fetchMock.mock.calls[1]).toEqual([
      '/api/admin/leads/lead-1/skip',
      { method: 'PATCH' },
    ]);
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Lead skipped');
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('keeps the lead and toasts when the skip is refused', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(queue([lead()]))
      .mockResolvedValueOnce(json({ error: 'nope' }, 500));
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Skip' }));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('Failed to skip lead')
    );
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('pages forward and back through a long queue', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async input => {
      const page = new URL(String(input), 'http://x').searchParams.get('page');
      return queue(
        [lead({ id: `lead-${page}`, displayName: `Lead ${page}` })],
        120,
        Number(page)
      );
    });
    const { container } = renderPanel();

    expect(await screen.findByText('Lead 1')).toBeInTheDocument();
    expect(screen.getByText('120 queued')).toBeInTheDocument();
    expect(screen.getByTestId('admin-pagination-range')).toHaveTextContent(
      '1–50 of 120 leads'
    );
    expect(
      screen.getByRole('button', { name: 'Previous Page' })
    ).toBeDisabled();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Next Page' }));
    expect(await screen.findByText('Lead 2')).toBeInTheDocument();
    expect(screen.getByTestId('admin-pagination-range')).toHaveTextContent(
      '51–100 of 120 leads'
    );

    await user.click(screen.getByRole('button', { name: 'Previous Page' }));
    expect(await screen.findByText('Lead 1')).toBeInTheDocument();
    expect(requestUrl(2).searchParams.get('page')).toBe('1');
  });
});
