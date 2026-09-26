import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CompanyActivityFeedView } from '@/components/features/admin/hud/CompanyActivityFeed';
import { composeCompanyActivity } from '@/lib/hud/company-activity';

const EMPTY_PRS = {
  availability: 'available' as const,
  totalOpen: 0,
  items: [],
  truncated: false,
  errorMessage: null,
};

describe('CompanyActivityFeedView', () => {
  it('renders rows with Linear id, state, actor, and provenance links', () => {
    const feed = composeCompanyActivity({
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
    });

    render(<CompanyActivityFeedView feed={feed} />);

    const panel = screen.getByTestId('ovie-mac-hud-activity-feed');
    expect(panel).toHaveTextContent('Company Activity');

    const rows = screen.getByTestId('ovie-mac-hud-activity-rows');
    expect(within(rows).getByText('JOV-4900')).toBeInTheDocument();
    expect(within(rows).getByText('Merge Queued')).toBeInTheDocument();
    expect(within(rows).getByText('Receipted')).toBeInTheDocument();
    expect(within(rows).getByText('PR #17156')).toBeInTheDocument();
    expect(
      within(rows).getByRole('link', { name: /feat\(hud\): activity feed/i })
    ).toHaveAttribute('href', 'https://github.com/JovieInc/Jovie/pull/17156');
  });

  it('shows an honest empty state when no source has rows', () => {
    const feed = composeCompanyActivity({
      operationalTasks: null,
      pullRequests: { ...EMPTY_PRS, availability: 'error' as const },
    });

    render(<CompanyActivityFeedView feed={feed} />);

    expect(screen.getByTestId('ovie-mac-hud-activity-feed')).toHaveTextContent(
      'No company activity observed from connected sources.'
    );
  });
});
