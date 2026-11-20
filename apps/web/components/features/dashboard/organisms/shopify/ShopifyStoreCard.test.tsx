import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ShopifyStoreCard, ShopifyStoreCardSkeleton } from './ShopifyStoreCard';

const dashboard = vi.hoisted(() => ({
  selectedProfile: { username: 'sashawaves' } as { username?: string } | null,
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => ({ selectedProfile: dashboard.selectedProfile }),
}));

const fetchMock = vi.fn();

function respondWith(saved: string | null, put?: () => Promise<Response>) {
  fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      return put ? put() : Promise.resolve(Response.json({ ok: true }));
    }
    return Promise.resolve(Response.json({ shopifyUrl: saved }));
  });
}

describe('ShopifyStoreCard', () => {
  beforeEach(() => {
    dashboard.selectedProfile = { username: 'sashawaves' };
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('renders an accessible skeleton while the setting loads', async () => {
    const { container } = render(<ShopifyStoreCardSkeleton />);
    expect(
      screen.getByRole('status', { name: 'Loading Shop Settings' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows the saved store with disconnect and preview actions', async () => {
    const user = userEvent.setup();
    respondWith('https://sasha.myshopify.com');
    const { container } = render(<ShopifyStoreCard />);

    const input = await screen.findByLabelText('Store URL');
    expect(input).toHaveValue('https://sasha.myshopify.com');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(
      screen.getByRole('link', { name: 'Preview shop link' })
    ).toHaveAttribute('href', expect.stringContaining('/sashawaves/shop'));
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Disconnect' })
      ).not.toBeInTheDocument()
    );
    expect(input).toHaveValue('');
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/dashboard/shop',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ shopifyUrl: null }),
      })
    );
  });

  it('keeps typed text and focus across a parent rerender', async () => {
    const user = userEvent.setup();
    respondWith(null);
    const { rerender } = render(<ShopifyStoreCard />);

    const input = await screen.findByLabelText('Store URL');
    await user.type(input, 'https://new-store.myshopify.com');
    expect(input).toHaveValue('https://new-store.myshopify.com');

    rerender(<ShopifyStoreCard />);
    expect(screen.getByLabelText('Store URL')).toHaveValue(
      'https://new-store.myshopify.com'
    );
    expect(screen.getByLabelText('Store URL')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('refuses a non-Shopify domain, then clears the error on edit', async () => {
    const user = userEvent.setup();
    respondWith(null);
    const { container } = render(<ShopifyStoreCard />);

    const input = await screen.findByLabelText('Store URL');
    await user.type(input, 'https://example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText(/valid \*\.myshopify\.com URL/)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);

    await user.type(input, '/x');
    expect(
      screen.queryByText(/valid \*\.myshopify\.com URL/)
    ).not.toBeInTheDocument();
  });

  it('confirms a save with the success token', async () => {
    const user = userEvent.setup();
    respondWith(null);
    const { container } = render(<ShopifyStoreCard />);

    await user.type(
      await screen.findByLabelText('Store URL'),
      'https://sasha.myshopify.com'
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const saved = await screen.findByText('Shopify store saved');
    expect(saved).toHaveClass('text-success-text');
    expect(saved.className).not.toMatch(/emerald/);
    await expectNoA11yViolations(container);
  });

  it('shows the server error and a network error', async () => {
    const user = userEvent.setup();
    let fail: 'server' | 'network' = 'server';
    respondWith(null, () =>
      fail === 'server'
        ? Promise.resolve(
            Response.json({ error: 'Store not found' }, { status: 404 })
          )
        : Promise.reject(new TypeError('Failed to fetch'))
    );
    render(<ShopifyStoreCard />);

    const input = await screen.findByLabelText('Store URL');
    await user.type(input, 'https://missing.myshopify.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Store not found')).toBeVisible();

    fail = 'network';
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('Network error — please try again')
    ).toBeVisible();
    expect(input).toHaveValue('https://missing.myshopify.com');
  });

  it('leaves out the preview link when the profile has no username', async () => {
    dashboard.selectedProfile = null;
    respondWith('https://sasha.myshopify.com');
    render(<ShopifyStoreCard />);

    await screen.findByLabelText('Store URL');
    expect(
      screen.queryByRole('link', { name: 'Preview shop link' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeVisible();
  });
});
