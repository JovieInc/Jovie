import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { EmailQueuePanel } from './EmailQueuePanel';

function lead(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `lead-${index}`,
    displayName: `Ari Lane ${index}`,
    contactEmail: `ari${index}@example.com`,
    priorityScore: 90,
    fitScore: 80,
    outreachStatus: 'pending',
    outreachQueuedAt: null,
    ...overrides,
  };
}

const fetchMock = vi.fn();

function serveQueue(queue: () => Promise<Response>) {
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/admin/outreach/settings')) {
      return Promise.resolve(Response.json({ campaignsEnabled: false }));
    }
    return queue();
  });
}

function page(items: unknown[], pendingTotal = items.length) {
  return async () =>
    Response.json({
      items,
      total: items.length,
      pendingTotal,
      page: 1,
      limit: 50,
    });
}

describe('EmailQueuePanel', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('requests the email queue by priority and lists its leads', async () => {
    serveQueue(page([lead(1)], 3));
    const { container } = render(<EmailQueuePanel />);

    expect(await screen.findByText('Ari Lane 1')).toBeVisible();
    expect(screen.getByText('3 pending')).toBeVisible();
    const queueUrl = String(
      fetchMock.mock.calls.find(
        ([url]) => !String(url).includes('settings')
      )?.[0]
    );
    expect(queueUrl).toContain('queue=email');
    expect(queueUrl).toContain('sort=priorityScore');
    // Delivery is disabled by policy, whatever the campaign setting says.
    expect(
      await screen.findByText(
        'Audience delivery is disabled. Draft review remains available.'
      )
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('shows the empty state when nothing is queued', async () => {
    serveQueue(page([], 0));
    const { container } = render(<EmailQueuePanel />);

    expect(await screen.findByText('No email leads')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Queue Next Batch' })
    ).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('shows the load error when the queue request fails or is offline', async () => {
    serveQueue(() => Promise.reject(new TypeError('Failed to fetch')));
    const { container } = render(<EmailQueuePanel />);

    expect(await screen.findByText('Unable to load email queue')).toBeVisible();
    expect(
      screen.getByText(
        'We could not load the email queue right now. Please try again shortly.'
      )
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('treats a non-ok response as a load error', async () => {
    serveQueue(async () => Response.json({}, { status: 500 }));
    render(<EmailQueuePanel />);

    expect(await screen.findByText('Unable to load email queue')).toBeVisible();
    expect(screen.getByText('0 pending')).toBeVisible();
  });

  it('shows placeholders for a lead missing its fields', async () => {
    serveQueue(
      page([
        lead(1, {
          displayName: null,
          contactEmail: null,
          priorityScore: null,
          fitScore: null,
        }),
      ])
    );
    const { container } = render(<EmailQueuePanel />);

    expect(await screen.findByText('Unknown creator')).toBeVisible();
    expect(screen.getByText('Not queued')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('keeps the batch count while delivery is disabled, across a re-render', async () => {
    serveQueue(page([lead(1)]));
    const user = userEvent.setup();
    const { rerender } = render(<EmailQueuePanel />);
    await screen.findByText('Ari Lane 1');
    const count = screen.getByLabelText('Queue Outreach Count');

    // Audience delivery is disabled by policy, so the count refuses typing.
    expect(count).toBeDisabled();
    await user.type(count, '25');
    rerender(<EmailQueuePanel />);
    await user.keyboard('{Escape}');

    expect(screen.getByLabelText('Queue Outreach Count')).toHaveValue(10);
    expect(
      screen.getByRole('switch', { name: 'Toggle Campaign Emails' })
    ).toBeDisabled();
  });

  it('stays axe-clean with long and right-to-left names', async () => {
    serveQueue(
      page([
        lead(1, { displayName: 'ليلى حسن' }),
        lead(2, {
          displayName:
            'Alexandria Montgomery-Wellington and the Midnight Orchestra',
        }),
      ])
    );
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <EmailQueuePanel />
      </div>
    );

    expect(await screen.findByText('ليلى حسن')).toBeVisible();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await expectNoA11yViolations(container);
  });
});
