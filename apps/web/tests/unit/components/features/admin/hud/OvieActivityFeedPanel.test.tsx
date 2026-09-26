import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OvieActivityFeedPanelView } from '@/components/features/admin/hud/OvieActivityFeedPanel';
import { composeOvieActivityFeed } from '@/lib/hud/ovie-activity-feed';
import type { OperationalTask } from '@/lib/ovie/shipping-state';

const RECEIPT = {
  linearIssue: 'JOV-5322',
  symphonyRef: 'symphony-task-9',
  mergeQueueRef: 'MQ-4',
  prodSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  receiptAt: '2026-09-25T10:00:00.000Z',
};

const RUNNING_TASK: OperationalTask = {
  id: 'linear:JOV-5000',
  linearIdentifier: 'JOV-5000',
  linearUrl: 'https://linear.app/jovie/issue/JOV-5000',
  title: 'Release the inbox redesign',
  workflowState: 'running',
  priority: 'high',
  attempt: 1,
  retryAt: null,
  sourceRevision: null,
  updatedAt: '2026-09-26T08:00:00.000Z',
};

describe('OvieActivityFeedPanelView', () => {
  it('renders Linear, runtime, receipt and public rows with exact states', () => {
    const feed = composeOvieActivityFeed({
      operational: { syncState: 'fresh', tasks: [RUNNING_TASK] },
      receipts: [RECEIPT],
      receiptsAvailable: true,
      publicUpdates: [
        {
          title: 'Faster profile editing',
          date: '2026-09-24',
          url: '/changelog',
        },
      ],
    });

    render(<OvieActivityFeedPanelView feed={feed} />);
    const panel = screen.getByTestId('ovie-activity-feed');

    expect(panel).toHaveTextContent('Activity');
    expect(panel).toHaveTextContent('Live');

    const taskRow = screen.getByTestId('activity-row-task:linear:JOV-5000');
    expect(taskRow).toHaveTextContent('In Progress');
    expect(taskRow).toHaveTextContent('JOV-5000');
    expect(taskRow).toHaveTextContent('Symphony runtime');

    const receiptRow = screen.getByTestId(
      `activity-row-receipt:JOV-5322:${RECEIPT.receiptAt}`
    );
    expect(receiptRow).toHaveTextContent('Deployed');
    expect(receiptRow).toHaveTextContent('Dogfood receipt');
    expect(receiptRow).toHaveTextContent('bbbbbbb');

    const publicRow = screen.getByTestId(
      'activity-row-public:/changelog:Faster profile editing'
    );
    expect(publicRow).toHaveTextContent('Public');
    expect(
      within(panel).getByRole('link', { name: /Faster profile editing/ })
    ).toHaveAttribute('href', '/changelog');
    expect(
      within(panel).getByRole('link', { name: /JOV-5000/ })
    ).toHaveAttribute('href', 'https://linear.app/jovie/issue/JOV-5000');
  });

  it('shows the syncing state when the ledger is still cold', () => {
    const feed = composeOvieActivityFeed({
      operational: { syncState: 'syncing', tasks: [] },
      receipts: [],
      receiptsAvailable: false,
      publicUpdates: [],
    });

    render(<OvieActivityFeedPanelView feed={feed} />);
    const panel = screen.getByTestId('ovie-activity-feed');
    expect(panel).toHaveTextContent('Syncing');
    expect(panel).toHaveTextContent('Loading the work ledger');
  });
});
