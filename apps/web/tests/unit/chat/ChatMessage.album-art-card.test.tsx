import { screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ChatMessage } from '@/components/jovie/components/ChatMessage';
import { fastRender } from '@/tests/utils/fast-render';

vi.mock('@/app/app/(shell)/dashboard/releases/actions', () => ({
  applyGeneratedReleaseAlbumArt: vi.fn(),
}));

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

vi.mock('@/components/jovie/components/ChatMarkdown', () => ({
  ChatMarkdown: ({ content }: { content: string }) => <div>{content}</div>,
}));

describe('ChatMessage album art tool cards', () => {
  it('renders generated album art previews', () => {
    fastRender(
      <ChatMessage
        id='assistant-album-art'
        role={'assistant' as const}
        parts={[
          { type: 'text', text: 'I generated a few cover options.' },
          {
            type: 'tool-invocation',
            toolInvocationId: 'tool-2',
            toolName: 'generateAlbumArt',
            state: 'result',
            result: {
              success: true,
              releaseId: 'release-1',
              sessionId: 'session-1',
              releaseTitle: 'Tokyo Drift',
              brandKitName: 'Armada',
              usedMatchingTemplate: false,
              quota: {
                remainingRunsForRelease: 1,
              },
              options: [
                { id: '1', previewUrl: 'https://example.com/one.png' },
                { id: '2', previewUrl: 'https://example.com/two.png' },
              ],
            },
            toolInvocation: {
              toolName: 'generateAlbumArt',
              state: 'result',
            },
          },
        ]}
      />
    );

    expect(screen.getByText('Album Art For Tokyo Drift')).toBeTruthy();
    expect(
      screen.getByText('Series template: Armada • 1 run left')
    ).toBeTruthy();
    expect(screen.getAllByAltText('Generated album art preview')).toHaveLength(
      2
    );
    expect(
      screen.getByRole('button', { name: 'Apply To Release' })
    ).toBeTruthy();
  });
});
