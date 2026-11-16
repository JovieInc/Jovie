import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DrawerAnalyticsSummaryCard } from './DrawerAnalyticsSummaryCard';

describe('DrawerAnalyticsSummaryCard', () => {
  it('renders large metrics and an optional footer', async () => {
    const { container } = render(
      <DrawerAnalyticsSummaryCard
        metrics={[
          {
            id: 'profile-views',
            label: 'Profile views',
            value: '120',
            hint: 'Visitors',
          },
          {
            id: 'link-clicks',
            label: 'Link clicks',
            value: '42',
            hint: 'Outbound',
          },
        ]}
        state='ready'
        footer={<button type='button'>Last 30 days</button>}
      />
    );

    expect(screen.getByText('Profile views')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(
      screen.getByTestId('drawer-analytics-metric-profile-views')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('drawer-analytics-metric-value-profile-views')
    ).toHaveTextContent('120');
    expect(screen.getByRole('button', { name: 'Last 30 days' })).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('renders an error message when analytics are unavailable', async () => {
    const { container } = render(
      <DrawerAnalyticsSummaryCard
        metrics={[]}
        state='error'
        errorMessage='No data yet.'
      />
    );

    expect(screen.getByText('No data yet.')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders loading placeholders while data is pending', async () => {
    const { container } = render(
      <DrawerAnalyticsSummaryCard
        metrics={[
          { id: 'profile-views', label: 'Profile views', value: '0' },
          { id: 'link-clicks', label: 'Link clicks', value: '0' },
        ]}
        state='loading'
        testId='analytics-card'
      />
    );

    expect(screen.getByTestId('analytics-card')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    expect(
      screen.getByRole('status', { name: 'Loading Analytics' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('marks the whole card busy when dimmed content includes a footer', () => {
    render(
      <DrawerAnalyticsSummaryCard
        metrics={[
          { id: 'profile-views', label: 'Profile views', value: '120' },
        ]}
        state='ready'
        dimmed={true}
        footer={<button type='button'>Last 30 days</button>}
        testId='analytics-card'
      />
    );

    expect(screen.getByTestId('analytics-card')).toHaveAttribute(
      'aria-busy',
      'true'
    );
  });

  it('reserves stable body and footer space across sparse states', async () => {
    const { container } = render(
      <DrawerAnalyticsSummaryCard
        metrics={[]}
        state='ready'
        emptyMessage='No clicks yet.'
        stableLayout
        reserveFooterSlot
        metricSlotCount={2}
        testId='analytics-card'
      />
    );

    expect(screen.getByTestId('analytics-card-body')).toHaveClass('min-h-27');
    expect(screen.getByTestId('analytics-card-footer')).toHaveClass(
      'invisible',
      'min-h-10'
    );
    await expectNoA11yViolations(container);
  });

  it('reserves metric hint rows in stable ready state', () => {
    render(
      <DrawerAnalyticsSummaryCard
        metrics={[
          { id: 'profile-views', label: 'Profile views', value: '120' },
        ]}
        state='ready'
        stableLayout
      />
    );

    const metric = screen.getByTestId('drawer-analytics-metric-profile-views');
    expect(metric.querySelector('p[aria-hidden="true"]')).toHaveClass(
      'invisible',
      'min-h-3'
    );
  });
});

describe('DrawerAnalyticsSummaryCard content states', () => {
  it('reserves the hint row for a metric without one', async () => {
    const { container } = render(
      <DrawerAnalyticsSummaryCard
        metrics={[
          { id: 'views', label: 'Views', value: '12.4k', hint: '+8%' },
          { id: 'clicks', label: 'Clicks', value: '3,204' },
        ]}
        state='ready'
        stableLayout
      />
    );

    expect(screen.getByText('+8%')).toBeVisible();
    expect(
      screen
        .getByTestId('drawer-analytics-metric-clicks')
        .querySelector('p[aria-hidden="true"]')
    ).toHaveClass('invisible');
    await expectNoA11yViolations(container);
  });

  it('keeps long labels, values and hints in their tiles', async () => {
    const label = 'Outbound clicks to streaming services';
    const hint =
      'Spotify, Apple Music, YouTube Music, Tidal and Deezer combined';
    const { container } = render(
      <DrawerAnalyticsSummaryCard
        metrics={[{ id: 'clicks', label, value: '987,654', hint }]}
        state='ready'
      />
    );

    const tile = screen.getByTestId('drawer-analytics-metric-clicks');
    expect(tile).toHaveTextContent(label);
    expect(tile).toHaveTextContent(hint);
    expect(
      screen.getByTestId('drawer-analytics-metric-value-clicks')
    ).toHaveTextContent('987,654');
    await expectNoA11yViolations(container);
  });

  it('renders metrics in a right-to-left drawer', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <DrawerAnalyticsSummaryCard
          metrics={[
            { id: 'views', label: 'المشاهدات', value: '12.4k' },
            { id: 'clicks', label: 'النقرات', value: '3,204' },
          ]}
          state='ready'
        />
      </div>
    );

    expect(screen.getByText('المشاهدات')).toBeInTheDocument();
    expect(screen.getByText('النقرات')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

describe('DrawerAnalyticsSummaryCard dimmed contrast (JOV-8873)', () => {
  it('dims refreshing content to 80% opacity, not 60%', () => {
    const { container } = render(
      <DrawerAnalyticsSummaryCard
        metrics={[
          { id: 'profile-views', label: 'Profile views', value: '120' },
        ]}
        state='ready'
        dimmed
      />
    );
    expect(container.querySelector('.opacity-80')).not.toBeNull();
    expect(container.querySelector('.opacity-60')).toBeNull();
  });
});

describe('DrawerAnalyticsSummaryCard scale tokens', () => {
  it('keeps type and size utilities on scale tokens instead of arbitrary values', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(
      join(import.meta.dirname, 'DrawerAnalyticsSummaryCard.tsx'),
      'utf8'
    );

    expect(source).not.toMatch(/leading-\[14px\]/);
    expect(source).toContain('leading-3.5');
  });
});
