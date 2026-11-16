import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WhatShippedResponse } from '@/lib/hud/what-shipped';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { WhatShipped } from './WhatShipped';

const fetchMock = vi.fn<typeof fetch>();

const item = (number: number, title: string) => ({
  number,
  title,
  merged_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  url: `https://github.com/JovieInc/Jovie/pull/${number}`,
});

const response = (
  overrides: Partial<WhatShippedResponse> = {}
): WhatShippedResponse => ({
  generatedAt: new Date().toISOString(),
  available: true,
  observation: 'ok',
  errorMessage: null,
  items: [item(17279, 'Keep workers alive'), item(17277, 'Observe health')],
  ...overrides,
});

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

function renderCard(props: Parameters<typeof WhatShipped>[0] = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: Readonly<PropsWithChildren>) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return render(<WhatShipped {...props} />, { wrapper: Wrapper });
}

describe('WhatShipped', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('holds skeleton rows while the first read is in flight', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    const { container } = renderCard();

    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(2);
    expect(screen.queryByTestId('what-shipped-observation')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('links every shipped PR, caps rows and sends the kiosk token', async () => {
    fetchMock.mockImplementation(() =>
      json(
        response({
          items: [item(1, 'One'), item(2, 'Two'), item(3, 'Three')],
        })
      )
    );
    const { container } = renderCard({
      kioskToken: 'kiosk-1',
      title: 'Shipped',
      limit: 2,
    });

    const links = await screen.findAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute(
      'href',
      'https://github.com/JovieInc/Jovie/pull/1'
    );
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(screen.getByText('Shipped')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain('/api/ops/what-shipped?kiosk=kiosk-1');
    await expectNoA11yViolations(container);
  });

  it('says nothing shipped after a successful empty read', async () => {
    fetchMock.mockImplementation(() => json(response({ items: [] })));
    const { container } = renderCard();

    expect(
      await screen.findByText('Nothing shipped in the last few hours.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('retries a failed first read from the keyboard', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementationOnce(() =>
      Promise.reject(new TypeError('Failed to fetch'))
    );
    fetchMock.mockImplementation(() => json(response()));
    const { container } = renderCard();

    expect(
      await screen.findByText('What shipped is unavailable.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Keep workers alive')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps last known rows with a retry when the feed is unavailable', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(() =>
      json(response({ observation: 'unavailable', available: false }))
    );
    const { container } = renderCard();

    expect(
      await screen.findByText('Showing last known shipped PRs.')
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expectNoA11yViolations(container);
  });

  it('names the missing source when it is not configured', async () => {
    fetchMock.mockImplementation(() =>
      json(
        response({
          items: [],
          observation: 'not_configured',
          errorMessage: 'What shipped source is not configured.',
        })
      )
    );
    renderCard();

    expect(
      await screen.findByText('What shipped source is not configured.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('keeps long titles axe-clean inside an RTL document', async () => {
    const long =
      'Route every release-day page, pre-save confirmation and playlist pitch through the shared certification pipeline';
    fetchMock.mockImplementation(() =>
      json(response({ items: [item(17300, long)] }))
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { container } = render(
      <QueryClientProvider client={client}>
        <div dir='rtl' lang='ar'>
          <WhatShipped />
        </div>
      </QueryClientProvider>
    );

    expect(await screen.findByText(long)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
