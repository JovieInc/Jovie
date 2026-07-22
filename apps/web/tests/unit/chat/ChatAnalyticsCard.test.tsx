import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import {
  ChatAnalyticsCard,
  formatChatActiveSignalsLabel,
} from '@/components/jovie/components/ChatAnalyticsCard';
import type { ChatInsightsToolResult } from '@/components/jovie/types';
import type { InsightResponse } from '@/types/insights';

function createInsight(
  overrides: Partial<InsightResponse> = {}
): InsightResponse {
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

function createResult(
  overrides: Partial<ChatInsightsToolResult> = {}
): ChatInsightsToolResult {
  return {
    success: true,
    title: 'Top signals',
    totalActive: 1,
    insights: [createInsight()],
    ...overrides,
  };
}

describe('formatChatActiveSignalsLabel', () => {
  it('uses the total count when every rendered signal is shown', () => {
    expect(formatChatActiveSignalsLabel(3, 3)).toBe('3 active signals');
    expect(formatChatActiveSignalsLabel(1, 1)).toBe('1 active signal');
  });

  it('clarifies preview truncation when the list shows fewer than total active', () => {
    expect(formatChatActiveSignalsLabel(3, 99)).toBe(
      'Showing 3 of 99 active signals'
    );
    expect(formatChatActiveSignalsLabel(1, 2)).toBe(
      'Showing 1 of 2 active signals'
    );
  });
});

describe('ChatAnalyticsCard', () => {
  it('renders nothing when there are no insights to show', () => {
    const { container } = render(
      <ChatAnalyticsCard
        result={createResult({ success: false, insights: [], totalActive: 99 })}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows a matching count when all active signals are rendered', () => {
    render(
      <ChatAnalyticsCard
        result={createResult({
          totalActive: 2,
          insights: [
            createInsight({ id: 'insight-1' }),
            createInsight({
              id: 'insight-2',
              title: 'Chicago listeners are surging',
            }),
          ],
        })}
      />
    );

    expect(screen.getByTestId('chat-analytics-signal-count')).toHaveTextContent(
      '2 active signals'
    );
    expect(screen.queryByRole('link', { name: /View all/i })).toBeNull();
    expect(screen.getAllByTestId('chat-analytics-signal-card')).toHaveLength(2);
  });

  it('shows a truncated preview label and view-all path when only top signals render', () => {
    render(
      <ChatAnalyticsCard
        result={createResult({
          totalActive: 99,
          insights: [
            createInsight({ id: 'insight-1' }),
            createInsight({
              id: 'insight-2',
              title: 'Chicago listeners are surging',
            }),
            createInsight({
              id: 'insight-3',
              title: 'Spotify saves are climbing',
            }),
          ],
        })}
      />
    );

    expect(screen.getByTestId('chat-analytics-signal-count')).toHaveTextContent(
      'Showing 3 of 99 active signals'
    );
    expect(screen.getAllByTestId('chat-analytics-signal-card')).toHaveLength(3);
    expect(screen.getByRole('link', { name: /View all/i })).toHaveAttribute(
      'href',
      '/app/insights'
    );
  });

  it('renders only one card for near-duplicate insight titles', () => {
    render(
      <ChatAnalyticsCard
        result={createResult({
          totalActive: 95,
          insights: [
            createInsight({
              id: 'dup-1',
              insightType: 'subscriber_surge',
              category: 'growth',
              title: '3 New Subscribers in One Month',
              actionSuggestion: 'Thank new fans with a short note.',
            }),
            createInsight({
              id: 'dup-2',
              insightType: 'subscriber_surge',
              category: 'growth',
              title: '3 New Subscribers in One Month (300% Growth)',
              actionSuggestion: 'Keep the welcome flow tight.',
            }),
            createInsight({
              id: 'dup-3',
              insightType: 'subscriber_surge',
              category: 'growth',
              title: '3 New Subscribers in One Month — 300% Growth',
              actionSuggestion: 'Double down on the capture CTA.',
            }),
          ],
        })}
      />
    );

    expect(screen.getAllByTestId('chat-analytics-signal-card')).toHaveLength(1);
    expect(screen.getByTestId('chat-analytics-signal-count')).toHaveTextContent(
      'Showing 1 of 95 active signals'
    );
    expect(screen.getByText('3 New Subscribers in One Month')).toBeTruthy();
    expect(screen.queryByText(/300% Growth/i)).toBeNull();
    // Quiet category label — no colored growth chip.
    expect(screen.getByText('growth')).toBeTruthy();
  });
});
