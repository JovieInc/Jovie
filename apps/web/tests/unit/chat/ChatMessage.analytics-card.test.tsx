import { screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ChatMessage } from '@/components/jovie/components/ChatMessage';
import { fastRender } from '@/tests/utils/fast-render';

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: ComponentProps<'div'>) => (
      <div {...props}>{children}</div>
    ),
  },
  useReducedMotion: () => true,
}));

vi.mock('@jovie/ui', () => ({
  SimpleTooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/jovie/components/ChatMarkdown', () => ({
  ChatMarkdown: ({ content }: { content: string }) => <div>{content}</div>,
}));

describe('ChatMessage analytics cards', () => {
  it('renders a chat analytics card for showTopInsights tool results', () => {
    const parts = [
      { type: 'text', text: 'Here are the strongest signals I see.' },
      {
        type: 'tool-invocation',
        toolInvocationId: 'tool-1',
        toolName: 'showTopInsights',
        state: 'result',
        result: {
          success: true,
          title: 'Top signals',
          totalActive: 2,
          insights: [
            {
              id: 'insight-1',
              insightType: 'subscriber_surge',
              category: 'growth',
              priority: 'high',
              title: 'Subscribers are picking up in Chicago',
              description: 'Reachable audience is growing faster there.',
              actionSuggestion:
                'Send your next release update to that segment.',
              confidence: '0.92',
              status: 'active',
              periodStart: '2026-03-01T00:00:00.000Z',
              periodEnd: '2026-03-07T00:00:00.000Z',
              createdAt: '2026-03-08T00:00:00.000Z',
              expiresAt: '2026-03-15T00:00:00.000Z',
            },
          ],
        },
        toolInvocation: {
          toolName: 'showTopInsights',
          state: 'result',
        },
      },
    ] as ComponentProps<typeof ChatMessage>['parts'];
    const messageProps = {
      id: 'assistant-1',
      role: 'assistant' as const,
      parts,
    };

    fastRender(<ChatMessage {...messageProps} />);

    expect(screen.getByTestId('chat-analytics-card')).toBeTruthy();
    expect(screen.getByText('Top signals')).toBeTruthy();
    expect(
      screen.getByText('Subscribers are picking up in Chicago')
    ).toBeTruthy();
  });
});
