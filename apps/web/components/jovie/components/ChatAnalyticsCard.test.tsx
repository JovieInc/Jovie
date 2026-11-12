import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ChatInsightsToolResult } from '@/components/jovie/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { InsightResponse } from '@/types/insights';
import {
  ChatAnalyticsCard,
  formatChatActiveSignalsLabel,
} from './ChatAnalyticsCard';

function insight(overrides: Partial<InsightResponse> = {}): InsightResponse {
  return {
    id: 'insight-1',
    insightType: 'city_growth',
    category: 'growth',
    priority: 'high',
    title: 'Fans in Austin are trending up',
    description: 'Austin traffic increased week over week.',
    actionSuggestion: 'Schedule a show announcement for Austin.',
    confidence: '0.87',
    status: 'active',
    periodStart: '2026-03-01T00:00:00.000Z',
    periodEnd: '2026-03-07T00:00:00.000Z',
    createdAt: '2026-03-08T00:00:00.000Z',
    expiresAt: '2026-03-15T00:00:00.000Z',
    ...overrides,
  };
}

function result(
  overrides: Partial<ChatInsightsToolResult> = {}
): ChatInsightsToolResult {
  return {
    success: true,
    title: 'Top signals',
    totalActive: 1,
    insights: [insight()],
    ...overrides,
  };
}

describe('ChatAnalyticsCard', () => {
  it('renders the active signals as a labelled list', async () => {
    const { container } = render(<ChatAnalyticsCard result={result()} />);

    const card = screen.getByRole('region', { name: 'Top signals' });
    const list = within(card).getByRole('list', { name: 'Top Signals' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(card).toHaveTextContent('Fans in Austin are trending up');
    expect(card).toHaveTextContent('Schedule a show announcement for Austin.');
    expect(screen.getByTestId('chat-analytics-signal-count')).toHaveTextContent(
      '1 active signal'
    );
    expect(screen.queryByRole('link', { name: 'View all' })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders nothing for a failed or empty insights result', () => {
    const failed = render(
      <ChatAnalyticsCard result={result({ success: false })} />
    );
    expect(failed.container).toBeEmptyDOMElement();
    failed.unmount();

    const empty = render(
      <ChatAnalyticsCard result={result({ totalActive: 0, insights: [] })} />
    );
    expect(empty.container).toBeEmptyDOMElement();
  });

  it('dedupes repeated signals and links to all signals when more exist', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ChatAnalyticsCard
        result={result({
          totalActive: 12,
          insights: [
            insight(),
            insight({ id: 'insight-dup' }),
            insight({
              id: 'insight-2',
              insightType: 'release_momentum',
              category: 'content',
              title:
                'Midnight Drive (Deluxe Anniversary Edition) is getting more saves than any release this year',
              actionSuggestion: null,
              description: 'Saves rose for three straight weeks.',
            }),
          ],
        })}
      />
    );

    expect(screen.getAllByTestId('chat-analytics-signal-card')).toHaveLength(2);
    expect(
      screen.getByText('Saves rose for three straight weeks.')
    ).toBeVisible();
    expect(screen.getByTestId('chat-analytics-signal-count')).toHaveTextContent(
      'Showing 2 of 12 active signals'
    );
    const viewAll = screen.getByRole('link', { name: 'View all' });
    expect(viewAll).toHaveAttribute('href', '/app/insights');
    await user.tab();
    expect(viewAll).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('keeps a right-to-left signal card axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ChatAnalyticsCard
          result={result({
            title: 'أبرز الإشارات',
            insights: [insight({ title: 'المعجبون في القاهرة في ازدياد' })],
          })}
        />
      </div>
    );

    expect(
      screen.getByRole('region', { name: 'أبرز الإشارات' })
    ).toHaveTextContent('المعجبون في القاهرة في ازدياد');
    await expectNoA11yViolations(container);
  });
});

describe('formatChatActiveSignalsLabel', () => {
  it('pluralizes and reports truncation', () => {
    expect(formatChatActiveSignalsLabel(1, 1)).toBe('1 active signal');
    expect(formatChatActiveSignalsLabel(3, 3)).toBe('3 active signals');
    expect(formatChatActiveSignalsLabel(3, 12)).toBe(
      'Showing 3 of 12 active signals'
    );
  });
});
