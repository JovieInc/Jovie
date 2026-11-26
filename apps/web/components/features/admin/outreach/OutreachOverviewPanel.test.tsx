import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OutreachOverviewPanel } from './OutreachOverviewPanel';

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const ok = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

describe('OutreachOverviewPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('holds a hidden skeleton while the counts load', async () => {
    stubFetch(() => new Promise<Response>(() => undefined));
    const { container } = render(<OutreachOverviewPanel />);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.queryByText('Outreach Pipeline')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the counts once loaded and derives a missing total', async () => {
    const fetchMock = stubFetch(() => ok({ counts: { email: 4, dm: 2 } }));
    const { container } = render(<OutreachOverviewPanel />);
    expect(await screen.findByText('6 total')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/outreach?counts=1');
    await expectNoA11yViolations(container);
  });

  it('shows an error message and zero counts when the route fails', async () => {
    stubFetch(() => Promise.resolve(new Response('{}', { status: 500 })));
    const { container } = render(<OutreachOverviewPanel embedded />);
    expect(
      await screen.findByText(/could not load outreach counts/i)
    ).toBeInTheDocument();
    expect(screen.getAllByText('0')).toHaveLength(4);
    await expectNoA11yViolations(container);
  });

  it('shows the same error when the network rejects', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    render(<OutreachOverviewPanel />);
    await waitFor(() =>
      expect(
        screen.getByText(/could not load outreach counts/i)
      ).toBeInTheDocument()
    );
  });
});
