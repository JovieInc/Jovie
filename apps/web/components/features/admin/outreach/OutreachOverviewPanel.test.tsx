import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OutreachOverviewPanel } from './OutreachOverviewPanel';

const LOAD_ERROR =
  'We could not load outreach counts right now. Please try again shortly.';

const fetchMock = vi.fn<typeof fetch>();

function respondWith(body: unknown, status = 200) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

describe('OutreachOverviewPanel', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('holds the layout with hidden skeleton cards while counts load', async () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));
    const { container } = render(<OutreachOverviewPanel />);
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/outreach?counts=1');
    expect(screen.queryByText('Outreach Pipeline')).toBeNull();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    await expectNoA11yViolations(container);
  });

  it('shows a hidden four-card grid while loading embedded', () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));
    const { container } = render(<OutreachOverviewPanel embedded />);
    const grid = container.firstElementChild;
    expect(grid).toHaveAttribute('aria-hidden', 'true');
    expect(grid?.children).toHaveLength(4);
  });

  it('shows the loaded counts', async () => {
    respondWith({ counts: { email: 24, dm: 9, manualReview: 3, total: 36 } });
    const { container } = render(<OutreachOverviewPanel />);
    expect(await screen.findByText('36 total')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.queryByText(LOAD_ERROR)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('shows zero in every queue when nothing is queued', async () => {
    respondWith({ counts: { email: 0, dm: 0, manualReview: 0, total: 0 } });
    const { container } = render(<OutreachOverviewPanel />);
    expect(await screen.findByText('0 total')).toBeInTheDocument();
    expect(screen.getAllByText('0')).toHaveLength(4);
    await expectNoA11yViolations(container);
  });

  it('sums the total from the queues a partial answer reports', async () => {
    respondWith({ counts: { email: 24, manualReview: 3 } });
    render(<OutreachOverviewPanel />);
    expect(await screen.findByText('27 total')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('treats an answer with no counts as all zero', async () => {
    respondWith({});
    render(<OutreachOverviewPanel embedded />);
    await waitFor(() => expect(screen.getAllByText('0')).toHaveLength(4));
    expect(screen.queryByText('Outreach Pipeline')).toBeNull();
  });

  it('explains a failed request above zeroed counts', async () => {
    respondWith({ error: 'nope' }, 500);
    const { container } = render(<OutreachOverviewPanel />);
    expect(await screen.findByText(LOAD_ERROR)).toBeInTheDocument();
    expect(screen.getByText('0 total')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('gives the same explanation when the request never reaches the server', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { container } = render(
      <div dir='rtl'>
        <OutreachOverviewPanel />
      </div>
    );
    expect(await screen.findByText(LOAD_ERROR)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
