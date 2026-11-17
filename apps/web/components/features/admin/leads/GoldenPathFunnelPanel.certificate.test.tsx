import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildGoldenPathReport } from '@/lib/acquisition/artist-offer-funnel';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { GoldenPathFunnelPanel } from './GoldenPathFunnelPanel';

const NOW = new Date(Date.UTC(2026, 9, 20, 12, 0, 0));
const at = (seconds: number) => new Date(Date.UTC(2026, 9, 20, 10, 0, seconds));

describe('GoldenPathFunnelPanel certificate', () => {
  it('renders both cohorts with stage counts and timings, axe-clean', async () => {
    const { container } = render(
      <GoldenPathFunnelPanel
        report={buildGoldenPathReport({
          totalVisits: 15,
          now: NOW,
          timelines: [
            { 'claim-link-open': at(0), start: at(5), claimed: at(65) },
            { start: at(0), 'sign-in': at(30), claimed: at(90) },
          ],
        })}
      />
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Golden Path Conversion' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'All consented visits' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Opened a claim link' })
    ).toBeInTheDocument();
    const lists = screen.getAllByRole('list');
    expect(lists).toHaveLength(2);
    const entered = within(lists[0]).getAllByRole('listitem')[0];
    expect(entered).toHaveTextContent('Entered');
    expect(entered).toHaveTextContent('15');
    expect(within(lists[0]).getByText('Page claimed')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('is axe-clean with no visits at all', async () => {
    const { container } = render(
      <GoldenPathFunnelPanel
        report={buildGoldenPathReport({
          totalVisits: 0,
          timelines: [],
          now: NOW,
        })}
      />
    );

    expect(screen.getAllByText('No base').length).toBeGreaterThan(0);
    expect(screen.queryByRole('alert')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('is axe-clean with a stalled-stage alert and unmapped stage names', async () => {
    const report = buildGoldenPathReport({
      totalVisits: 5,
      timelines: [],
      now: NOW,
    });
    const { container } = render(
      <GoldenPathFunnelPanel
        report={{
          ...report,
          stalledStages: ['sign-in', 'paid'],
          uninstrumented: ['identity-resolved', 'first-share'],
        }}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'No events this week despite upstream traffic: Signed in, Paid. The step is broken or not instrumented.'
    );
    expect(
      screen.getByText('Not measured yet: identity-resolved, first-share.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('is axe-clean when the report is unavailable', async () => {
    const { container } = render(<GoldenPathFunnelPanel report={null} />);

    expect(
      screen.getByText(
        'The funnel could not be read. Check the artist-offer funnel report.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
    await expectNoA11yViolations(container);
  });
});
