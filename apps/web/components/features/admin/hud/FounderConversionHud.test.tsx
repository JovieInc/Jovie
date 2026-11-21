import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ShippingVelocityResponse } from '@/app/api/admin/hud/shipping-velocity/route';
import type { FounderFunnelData } from '@/lib/admin/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  FounderConversionHud,
  FounderConversionHudSkeleton,
} from './FounderConversionHud';

const funnel: FounderFunnelData = {
  timeRange: '30d',
  biggestDropOffKey: 'accounts_created',
  errors: [],
  definitionVersion: 'founder-funnel.v2',
  stages: [
    {
      key: 'accounts_created',
      label: 'Accounts created',
      description: 'Created an account',
      count: 40,
      conversionRate: 0.4,
      dropOff: 60,
      identifiable: true,
      drillDownHref: '/app/ov/growth?view=leads&funnelStage=accounts_created',
    },
  ],
};

const velocity: ShippingVelocityResponse = {
  data: Array.from({ length: 7 }, (_, index) => ({
    date: `2026-10-0${index + 1}`,
    merged: 2,
    opened: 3,
    closed: 0,
  })),
  range: '30d',
  cachedAt: '2026-10-08T12:00:00Z',
  observation: 'fresh',
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FounderConversionHud', () => {
  it('shows MRR and merges per day once velocity loads, keyboard reachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(velocity)))
    );
    const user = userEvent.setup();
    const { container } = render(
      <FounderConversionHud mrrUsd={5200} initialFunnel={funnel} />,
      { wrapper }
    );

    expect(screen.getByTestId('founder-hud-mrr')).toHaveTextContent('$5,200');
    await waitFor(() =>
      expect(
        screen.getByTestId('founder-hud-shipping-velocity')
      ).toHaveTextContent('2.0/day')
    );
    await user.tab();
    expect(container.contains(document.activeElement)).toBe(true);
    await expectNoA11yViolations(container);
  });

  it('falls back to dashes when MRR is unavailable and velocity is offline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 503 }))
    );
    const user = userEvent.setup();
    const { container } = render(
      <FounderConversionHud mrrUsd={null} initialFunnel={funnel} />,
      { wrapper }
    );

    await user.tab();
    expect(screen.getByTestId('founder-hud-mrr')).toHaveTextContent('—');
    expect(
      screen.getByTestId('founder-hud-shipping-velocity')
    ).toHaveTextContent('—');
    await expectNoA11yViolations(container);
  });

  it('renders the loading skeleton without interactive content', async () => {
    const { container } = render(<FounderConversionHudSkeleton />);
    expect(screen.getByTestId('founder-conversion-hud-skeleton')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
