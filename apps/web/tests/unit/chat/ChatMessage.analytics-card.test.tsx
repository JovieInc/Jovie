import { screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ChatMessage } from '@/components/jovie/components/ChatMessage';
import { fastRender } from '@/tests/utils/fast-render';

vi.mock('motion/react', () => ({
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      transition: _transition,
      ...props
    }: ComponentProps<'div'> & {
      initial?: unknown;
      animate?: unknown;
      transition?: unknown;
    }) => <div {...props}>{children}</div>,
  },
  useReducedMotion: () => true,
}));

vi.mock('@jovie/ui', () => ({
  SimpleTooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('next/dynamic', () => ({
  default:
    () =>
    ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock('@/components/jovie/components/ChatMarkdown', () => ({
  ChatMarkdown: ({ content }: { content: string }) => <div>{content}</div>,
}));

describe('ChatMessage analytics cards', () => {
  it('renders assistant replies with neutral message chrome', () => {
    const messageProps = {
      id: 'assistant-2',
      role: 'assistant' as const,
      parts: [{ type: 'text', text: 'Here is a cleaner response.' }],
    };
    fastRender(<ChatMessage {...messageProps} />);

    expect(screen.getByTestId('chat-message-reply-bubble')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy message' })).toBeTruthy();
    expect(screen.queryByText('Copy')).toBeNull();
  });

  it('renders a chat analytics card for showTopInsights tool results', () => {
    const parts = [
      { type: 'text', text: 'Here are the strongest signals I see.' },
      {
        type: 'dynamic-tool',
        toolName: 'showTopInsights',
        toolCallId: 'tool-1',
        state: 'output-available',
        input: { artistId: 'artist-1' },
        output: {
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

  it('renders a compact error row for unknown failed tools', () => {
    const messageProps = {
      id: 'assistant-3',
      role: 'assistant' as const,
      parts: [
        {
          type: 'dynamic-tool' as const,
          toolName: 'unknownTool',
          toolCallId: 'tool-unknown',
          state: 'output-error' as const,
          input: { value: 1 },
          errorText: 'Something broke',
        },
      ],
    };

    fastRender(<ChatMessage {...messageProps} />);

    const statusRow = screen.getByTestId('tool-status-row');
    expect(statusRow.getAttribute('role')).toBe('alert');
    expect(statusRow.getAttribute('data-tool-name')).toBe('unknownTool');
    expect(screen.getByText('Unknown Tool Failed')).toBeTruthy();
    expect(screen.getByText('Something broke')).toBeTruthy();
  });
});
