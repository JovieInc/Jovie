import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { cockpitMetrics } from '@/tests/fixtures/hud-cockpit';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HudBottlenecksCard } from './HudBottlenecksCard';

const failingDeploy = {
  deployments: {
    current: {
      status: 'failure',
      branch: 'main',
      url: 'https://vercel.com/jovie/web/deployments/1',
    },
  },
};

describe('HudBottlenecksCard', () => {
  it('says so when nothing is constraining the company', async () => {
    const { container } = render(
      <HudBottlenecksCard metrics={cockpitMetrics()} />
    );
    expect(screen.getByText('No bottlenecks detected.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('ranks a failing deploy with its branch and an inspect link', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <HudBottlenecksCard metrics={cockpitMetrics(failingDeploy)} />
    );
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(
      within(items[0]).getByText('Shipping pipeline is failing')
    ).toBeInTheDocument();
    expect(
      within(items[0]).getByText('Latest deploy failed on main')
    ).toBeInTheDocument();
    const link = screen.getByRole('link', {
      name: 'Inspect Shipping pipeline is failing',
    });
    expect(link).toHaveAttribute(
      'href',
      'https://vercel.com/jovie/web/deployments/1'
    );
    expect(link).toHaveAttribute('target', '_blank');
    await user.tab();
    expect(link).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('caps the list at three bottlenecks in impact order', async () => {
    const { container } = render(
      <HudBottlenecksCard
        metrics={cockpitMetrics({
          ...failingDeploy,
          aiOps: {
            counts: { blocked: 2, failed: 1 },
            mergeQueue: { openAgentPrs: 1 },
            blockers: [{ summary: 'Waiting on review', url: null }],
          },
          reliability: { unresolvedSentryIssues24h: 4, p95LatencyMs: 40 },
          sources: {
            stripe: {
              key: 'stripe',
              label: 'Stripe',
              state: 'degraded',
              dashboardUrl: null,
            },
            mercury: {
              key: 'mercury',
              label: 'Mercury',
              state: 'ok',
              dashboardUrl: null,
            },
          },
        })}
      />
    );
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Shipping pipeline is failing');
    expect(items[1]).toHaveTextContent('3 agent tasks blocked or failed');
    expect(items[1]).toHaveTextContent('Waiting on review');
    expect(items[2]).toHaveTextContent('4 unresolved errors in 24h');
    expect(
      screen.queryByText('Revenue data is stale or disconnected')
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('omits the link and detail when a bottleneck has neither', () => {
    render(
      <HudBottlenecksCard
        metrics={cockpitMetrics({
          reliability: { unresolvedSentryIssues24h: 1, p95LatencyMs: 40 },
        })}
      />
    );
    expect(screen.getByText('1 unresolved error in 24h')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('stays axe-clean inside an RTL document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <HudBottlenecksCard metrics={cockpitMetrics(failingDeploy)} />
      </div>
    );
    expect(
      screen.getByText('Shipping pipeline is failing')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
