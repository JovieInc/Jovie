import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OvieActivityFeedView } from '@/components/features/admin/hud/OvieActivityFeed';
import type { OvieActivityRow } from '@/lib/hud/company-activity';

function row(overrides: Partial<OvieActivityRow>): OvieActivityRow {
  return {
    id: 'row-1',
    state: 'merged',
    stateLabel: 'Merged',
    title: 'Shipped thing',
    actor: 'GitHub',
    linearId: null,
    linearUrl: null,
    href: null,
    receipt: null,
    freshness: 'fresh',
    updatedAtIso: null,
    detail: null,
    ...overrides,
  };
}

describe('OvieActivityFeedView', () => {
  it('renders rows with Linear id, actor, state, and provenance link', () => {
    render(
      <OvieActivityFeedView
        observation='ok'
        rows={[
          row({
            id: 'task-1',
            state: 'in_progress',
            stateLabel: 'In Progress',
            title: 'Company activity feed',
            actor: 'Symphony runtime',
            linearId: 'JOV-5322',
          }),
          row({
            id: 'pr-1',
            title: 'feat: feed',
            href: 'https://github.com/JovieInc/Jovie/pull/18400',
            detail: 'PR #18400 landed',
          }),
          row({
            id: 'receipt-1',
            state: 'deployed',
            stateLabel: 'Deployed',
            title: 'JOV-5300 verified on production',
            actor: 'Summer',
            receipt: 'prod abc1234',
          }),
        ]}
      />
    );

    const feed = screen.getByTestId('ovie-activity-feed');
    expect(feed).toHaveTextContent('JOV-5322');
    expect(feed).toHaveTextContent('Symphony runtime');
    expect(feed).toHaveTextContent('In Progress');
    expect(feed).toHaveTextContent('Deployed');
    expect(feed).toHaveTextContent('receipt prod abc1234');
    expect(
      within(feed).getByRole('link', { name: /feat: feed/i })
    ).toHaveAttribute('href', 'https://github.com/JovieInc/Jovie/pull/18400');
  });

  it('discloses stale and unknown freshness instead of implying current data', () => {
    render(
      <OvieActivityFeedView
        observation='ok'
        rows={[row({ freshness: 'unknown' })]}
      />
    );
    expect(screen.getByTestId('ovie-activity-feed')).toHaveTextContent(
      'freshness unknown'
    );
  });

  it('shows honest empty and unavailable states', () => {
    const { rerender } = render(
      <OvieActivityFeedView observation='empty' rows={[]} />
    );
    expect(screen.getByTestId('ovie-activity-feed')).toHaveTextContent(
      'No verified company activity yet.'
    );
    rerender(<OvieActivityFeedView observation='unavailable' rows={[]} />);
    expect(screen.getByTestId('ovie-activity-feed')).toHaveTextContent(
      'Company activity sources unavailable.'
    );
  });
});
