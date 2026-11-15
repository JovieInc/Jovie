import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { measuredCount } from '@/lib/ovie/shipping-state/contract';
import type { ShippingStateView } from '@/lib/ovie/shipping-state-client';
import { cockpitMetrics, cockpitShipping } from '@/tests/fixtures/hud-cockpit';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HudCompanyMetricCards } from './HudCompanyMetricCards';

function shippingWithMerges(
  last7Days: ShippingStateView['delivery']['merges']['last7Days'],
  prior7Days: ShippingStateView['delivery']['merges']['prior7Days']
): ShippingStateView {
  return {
    ...cockpitShipping,
    delivery: {
      ...cockpitShipping.delivery,
      merges: { ...cockpitShipping.delivery.merges, last7Days, prior7Days },
    },
  };
}

describe('HudCompanyMetricCards', () => {
  it('renders the four cockpit cards for a healthy company', async () => {
    const { container } = render(
      <HudCompanyMetricCards
        metrics={cockpitMetrics()}
        shipping={cockpitShipping}
      />
    );
    const company = screen.getByTestId('ovie-core-metric-company-survival');
    expect(within(company).getByText('Company')).toBeInTheDocument();
    expect(company).toHaveTextContent('$1.2M cash · 18.0mo runway');
    expect(company).toHaveAttribute('data-state');

    const growth = screen.getByTestId('ovie-core-metric-primary-outcome');
    expect(within(growth).getByText('Week Over Week')).toBeInTheDocument();
    expect(growth).toHaveTextContent('$42K MRR · 900 paying');

    const shipping = screen.getByTestId('hud-metric-shipping');
    expect(within(shipping).getByText('12')).toBeInTheDocument();
    expect(shipping).toHaveTextContent('merged last 7 days (+20% WoW)');

    const blockers = screen.getByTestId('hud-metric-blockers');
    expect(within(blockers).getByText('0')).toBeInTheDocument();
    expect(blockers).toHaveTextContent(
      '1 agent PRs open · 0 unresolved errors'
    );
    await expectNoA11yViolations(container);
  });

  it('explains missing financial data instead of showing numbers', async () => {
    const { container } = render(
      <HudCompanyMetricCards
        metrics={cockpitMetrics({
          overview: {
            financialDataAvailable: false,
            defaultStatusDetail: 'Mercury transaction window timed out.',
            runwayMonths: null,
            balanceUsd: 0,
            mrrUsd: 0,
            activeSubscribers: 0,
            weekAgo: null,
          },
        })}
        shipping={cockpitShipping}
      />
    );
    expect(
      screen.getByText('Mercury transaction window timed out.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Revenue source not connected')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('says when runway is not finite', () => {
    render(
      <HudCompanyMetricCards
        metrics={cockpitMetrics({
          overview: {
            financialDataAvailable: true,
            defaultStatusDetail: 'Profitable',
            runwayMonths: null,
            balanceUsd: 500_000,
            mrrUsd: 42_000,
            activeSubscribers: 900,
            weekAgo: null,
          },
        })}
        shipping={cockpitShipping}
      />
    );
    expect(
      screen.getByTestId('ovie-core-metric-company-survival')
    ).toHaveTextContent('$500K cash · no finite runway');
  });

  it('shows a dash when merges are not measured', () => {
    const unmeasured = {
      ...cockpitShipping.delivery.merges.last7Days,
      value: null,
    } as ShippingStateView['delivery']['merges']['last7Days'];
    render(
      <HudCompanyMetricCards
        metrics={cockpitMetrics()}
        shipping={shippingWithMerges(unmeasured, measuredCount(10))}
      />
    );
    const shipping = screen.getByTestId('hud-metric-shipping');
    expect(within(shipping).getByText('—')).toBeInTheDocument();
    expect(shipping).toHaveTextContent('Merges not measured');
  });

  it('drops the week-over-week delta when the prior week had no merges', () => {
    render(
      <HudCompanyMetricCards
        metrics={cockpitMetrics()}
        shipping={shippingWithMerges(measuredCount(5), measuredCount(0))}
      />
    );
    const shipping = screen.getByTestId('hud-metric-shipping');
    expect(shipping).toHaveTextContent('merged last 7 days');
    expect(shipping).not.toHaveTextContent('WoW');
  });

  it('sums blocked and failed agent work as critical blockers', async () => {
    const { container } = render(
      <div dir='rtl'>
        <HudCompanyMetricCards
          metrics={cockpitMetrics({
            aiOps: {
              counts: { blocked: 1_200, failed: 34 },
              mergeQueue: { openAgentPrs: 7 },
              blockers: [],
            },
            reliability: { unresolvedSentryIssues24h: 3, p95LatencyMs: 40 },
          })}
          shipping={shippingWithMerges(measuredCount(8), measuredCount(10))}
        />
      </div>
    );
    const blockers = screen.getByTestId('hud-metric-blockers');
    expect(within(blockers).getByText('1,234')).toBeInTheDocument();
    expect(blockers).toHaveTextContent(
      '7 agent PRs open · 3 unresolved errors'
    );
    expect(screen.getByTestId('hud-metric-shipping')).toHaveTextContent(
      '(-20% WoW)'
    );
    await expectNoA11yViolations(container);
  });
});
