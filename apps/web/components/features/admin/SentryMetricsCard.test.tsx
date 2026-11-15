import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AdminSentryMetrics } from '@/lib/admin/sentry-metrics';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SentryMetricsCard } from './SentryMetricsCard';

const metrics: AdminSentryMetrics = {
  unresolvedIssues24h: 3,
  totalEvents24h: 1280,
  impactedUsers24h: 14,
  criticalIssues24h: 0,
  topIssueTitle: 'TypeError: Cannot read property of undefined',
  topIssueShortId: 'JOVIE-42',
  isConfigured: true,
  isAvailable: true,
};

describe('SentryMetricsCard', () => {
  it('shows the four 24-hour counts and the top issue', async () => {
    const { container } = render(<SentryMetricsCard metrics={metrics} />);

    expect(screen.getByRole('heading', { name: 'Sentry' })).toBeInTheDocument();
    expect(screen.getByText('1,280')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(
      screen.getByTitle(
        'JOVIE-42: TypeError: Cannot read property of undefined'
      )
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('says there are no unresolved issues instead of a blank top issue', async () => {
    const { container } = render(
      <SentryMetricsCard
        metrics={{
          ...metrics,
          unresolvedIssues24h: 0,
          topIssueTitle: null,
          topIssueShortId: null,
        }}
      />
    );

    expect(
      screen.getByText('No unresolved issues in the last 24 hours.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows the read failure when Sentry is unavailable', async () => {
    const { container, rerender } = render(
      <SentryMetricsCard
        metrics={{
          ...metrics,
          isAvailable: false,
          errorMessage: 'Sentry API returned 502.',
        }}
      />
    );

    expect(screen.getByText('Sentry API returned 502.')).toBeInTheDocument();
    expect(screen.queryByText('Unresolved Issues')).toBeNull();
    await expectNoA11yViolations(container);

    rerender(
      <SentryMetricsCard metrics={{ ...metrics, isAvailable: false }} />
    );
    expect(
      screen.getByText(
        'Sentry metrics are temporarily unavailable. Please try again shortly.'
      )
    ).toBeInTheDocument();
  });

  it('explains how to configure Sentry when it is not set up', async () => {
    const { container } = render(
      <SentryMetricsCard metrics={{ ...metrics, isConfigured: false }} />
    );

    expect(
      screen.getByText(/Sentry integration not configured/)
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps large counts and an RTL document axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <SentryMetricsCard
          metrics={{ ...metrics, totalEvents24h: 9_876_543 }}
        />
      </div>
    );

    expect(screen.getByText('9,876,543')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
