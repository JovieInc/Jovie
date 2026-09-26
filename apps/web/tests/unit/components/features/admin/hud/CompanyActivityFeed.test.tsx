import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CompanyActivityFeedView } from '@/components/features/admin/hud/CompanyActivityFeed';
import { composeCompanyActivity } from '@/lib/hud/company-activity';
import type { ShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';

type OperationalTaskFeed = ShippingCockpitProjection['operationalTasks'];

const EMPTY_PRS = {
  availability: 'available' as const,
  totalOpen: 0,
  items: [],
  truncated: false,
  errorMessage: null,
};

function tasksFeed(
  overrides: Partial<OperationalTaskFeed> = {}
): OperationalTaskFeed {
  return {
    canonicalSource: 'linear',
    cacheMode: 'local-reconciled',
    syncState: 'fresh',
    sourceId: 'symphony-runtime',
    observedAt: '2026-09-26T10:00:00.000Z',
    lastSyncedAt: '2026-09-26T10:00:00.000Z',
    freshnessDeadline: '2026-09-26T10:00:10.000Z',
    tasks: [],
    deltas: [],
    ...overrides,
  };
}

describe('CompanyActivityFeedView', () => {
  it('renders rows with Linear id, state, actor, and provenance links', () => {
    const feed = composeCompanyActivity({
      operationalTasks: tasksFeed({
        tasks: [
          {
            id: 'linear:JOV-5322',
            linearIdentifier: 'JOV-5322',
            linearUrl: 'https://linear.app/jovie/issue/JOV-5322/feed',
            title: 'Company activity feed',
            workflowState: 'running',
            priority: 'high',
            attempt: null,
            retryAt: null,
            sourceRevision: null,
            updatedAt: '2026-09-26T10:00:00.000Z',
          },
        ],
      }),
      pullRequests: {
        ...EMPTY_PRS,
        items: [
          {
            number: 17156,
            title: 'feat(hud): activity feed',
            url: 'https://github.com/JovieInc/Jovie/pull/17156',
            headRefName: 'devin/jov-5322-x',
            authorLogin: 'devin-ai-integration',
            updatedAtIso: '2026-09-26T09:00:00.000Z',
            status: 'merge_queue' as const,
            statusLabel: 'MQ',
            statusDetail: 'Position 2',
            mergeQueuePosition: 2,
          },
        ],
      },
      receiptedShips: [
        {
          linearIssue: 'JOV-4900',
          symphonyRef: 'sym-1',
          mergeQueueRef: 'mq-1',
          prodSha: '0123456789abcdef0123456789abcdef01234567',
          receiptAt: '2026-09-26T08:00:00.000Z',
        },
      ],
      receiptsAvailable: true,
      publicDigest: {
        availability: 'available',
        items: [
          {
            title: 'Faster profile pages',
            slug: 'faster-profile-pages-v1-2-0-0',
            date: '2026-09-25',
            technicalVersion: '1.2.0',
          },
        ],
      },
    });

    render(<CompanyActivityFeedView feed={feed} />);

    const panel = screen.getByTestId('ovie-mac-hud-activity-feed');
    expect(panel).toHaveTextContent('Company Activity');

    const rows = screen.getByTestId('ovie-mac-hud-activity-rows');
    expect(within(rows).getAllByText('JOV-5322')).not.toHaveLength(0);
    expect(within(rows).getAllByText('In Progress')).not.toHaveLength(0);
    expect(within(rows).getByText('Merge Queued')).toBeInTheDocument();
    expect(within(rows).getByText('Public')).toBeInTheDocument();
    expect(within(rows).getByText('Receipted')).toBeInTheDocument();
    expect(within(rows).getByText('PR #17156')).toBeInTheDocument();
    expect(
      within(rows).getByRole('link', { name: /Company activity feed/i })
    ).toHaveAttribute('href', 'https://linear.app/jovie/issue/JOV-5322/feed');
    expect(
      within(rows).getByRole('link', { name: /Faster profile pages/i })
    ).toHaveAttribute('href', '/changelog#faster-profile-pages-v1-2-0-0');
  });

  it('shows an honest empty state when no source has rows', () => {
    const feed = composeCompanyActivity({
      operationalTasks: null,
      pullRequests: { ...EMPTY_PRS, availability: 'error' as const },
      receiptsAvailable: false,
      publicDigest: null,
    });

    render(<CompanyActivityFeedView feed={feed} />);

    const panel = screen.getByTestId('ovie-mac-hud-activity-feed');
    expect(panel).toHaveTextContent(
      'No company activity observed from connected sources.'
    );
    expect(panel).toHaveTextContent('Linear Unavailable');
    expect(panel).toHaveTextContent('GitHub Unavailable');
    expect(panel).toHaveTextContent('Receipts Unavailable');
    expect(panel).toHaveTextContent("What's New Unavailable");
  });
});
