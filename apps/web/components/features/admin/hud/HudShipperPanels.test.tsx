import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HudGithubBudgetPanel, HudShipperNeedPanel } from './HudShipperPanels';
import {
  longShipperPayload,
  rateLimitsPayload,
  shipperPayload,
  unconfiguredRateLimits,
} from './HudShipperPanels.fixtures';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HudShipperNeedPanel', () => {
  it('shows the shipper ledger without a nested border', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(shipperPayload))
    );
    const { container } = render(
      <HudShipperNeedPanel source='admin-session' />,
      {
        wrapper,
      }
    );
    expect(await screen.findByText('In-flight ledger')).toBeVisible();
    const job = screen.getByText('#101').parentElement;
    expect(job).toHaveClass('bg-surface-0');
    expect(job).not.toHaveClass('border');
    await expectNoA11yViolations(container);
  });

  it('lists recent errors in a borderless log', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(longShipperPayload))
    );
    const { container } = render(
      <HudShipperNeedPanel source='admin-session' />,
      {
        wrapper,
      }
    );
    const log = await screen.findByText(/error 1: dispatch queue/);
    expect(log.tagName).toBe('PRE');
    expect(log).not.toHaveClass('border');
    await expectNoA11yViolations(container);
  });

  it('stays on the signed-in path for kiosk tokens', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<HudShipperNeedPanel source='kiosk-token' />, {
      wrapper,
    });
    expect(screen.getByText('No Signal')).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('retries after a failed load', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('x', { status: 500 }))
      .mockResolvedValue(Response.json(shipperPayload));
    vi.stubGlobal('fetch', fetchMock);
    render(<HudShipperNeedPanel source='admin-session' />, { wrapper });

    expect(
      await screen.findByText('Shipper status is unavailable.')
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    await waitFor(() =>
      expect(screen.getByText('In-flight ledger')).toBeVisible()
    );
  });
});

describe('HudGithubBudgetPanel', () => {
  it('shows remaining core and GraphQL budget', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(rateLimitsPayload))
    );
    const { container } = render(<HudGithubBudgetPanel />, { wrapper });
    expect(await screen.findByText('4,200')).toBeVisible();
    expect(screen.getByText('3,100')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('explains missing credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(unconfiguredRateLimits))
    );
    render(<HudGithubBudgetPanel />, { wrapper });
    expect(
      await screen.findByText(/Configure HUD GitHub credentials/)
    ).toBeVisible();
  });
});
