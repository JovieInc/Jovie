import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { FunnelMetricsStrip } from './FunnelMetricsStrip';
import {
  FUNNEL_METRICS_EMPTY,
  FUNNEL_METRICS_FIXTURE,
  FUNNEL_METRICS_LARGE,
  FUNNEL_METRICS_NO_STRIPE,
} from './FunnelMetricsStrip.fixture';

function card(label: string) {
  const node = screen.getByText(label).closest('[class*="p-4"]');
  if (!(node instanceof HTMLElement)) throw new Error(`no card ${label}`);
  return within(node);
}

describe('FunnelMetricsStrip certificate', () => {
  it('shows revenue, runway and activation metrics', async () => {
    const { container } = render(
      <FunnelMetricsStrip metrics={FUNNEL_METRICS_FIXTURE} />
    );

    expect(card('MRR').getByText('$500.00')).toBeInTheDocument();
    expect(card('ARR').getByText('$6,000')).toBeInTheDocument();
    expect(card('Runway').getByText('Infinite')).toBeInTheDocument();
    expect(card('Runway').getByText('Revenue covers burn')).toBeInTheDocument();
    expect(screen.getByText('WoW — · MoM 25.0%')).toBeInTheDocument();
    expect(card('Open Rate').getByText('40.0%')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('reaches every Configure link from the keyboard', async () => {
    const user = userEvent.setup();
    render(<FunnelMetricsStrip metrics={FUNNEL_METRICS_FIXTURE} />);

    const links = screen.getAllByRole('link', { name: 'Configure' });
    expect(links).toHaveLength(3);
    for (const link of links) {
      await user.tab();
      expect(link).toHaveFocus();
      expect(link).toHaveAttribute('href', APP_ROUTES.SETTINGS_BILLING);
    }
  });

  it('shows an empty account without inventing revenue', async () => {
    const { container } = render(
      <FunnelMetricsStrip metrics={FUNNEL_METRICS_EMPTY} />
    );

    expect(card('MRR').getByText('$0.00')).toBeInTheDocument();
    expect(card('Runway').getByText('No balance')).toBeInTheDocument();
    expect(
      card('Runway').getByText('Add bank balance to calculate')
    ).toBeInTheDocument();
    expect(card('Engagement proxy').getByText('0')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows dashes for every revenue card when Stripe is disconnected', async () => {
    const { container } = render(
      <FunnelMetricsStrip metrics={FUNNEL_METRICS_NO_STRIPE} />
    );

    expect(card('MRR').getByText('—')).toBeInTheDocument();
    expect(card('ARR').getByText('—')).toBeInTheDocument();
    expect(card('Paying customers').getByText('—')).toBeInTheDocument();
    expect(
      card('Runway').getByText('Connect Stripe to calculate')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps large values and an RTL document axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <FunnelMetricsStrip metrics={FUNNEL_METRICS_LARGE} />
      </div>
    );

    expect(card('ARR').getByText('$148,148,136')).toBeInTheDocument();
    expect(card('Runway').getByText('128.4mo')).toBeInTheDocument();
    expect(
      card('Runway').getByText('at $12,345,678/mo revenue')
    ).toBeInTheDocument();
    expect(screen.getByText('September 14, 2031')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
