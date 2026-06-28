import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  ChatThreadNavigationRail,
  THREAD_NAV_RAIL_MIN_MESSAGES,
} from '@/components/features/chat/navigation-rail';
import {
  deriveThreadTurns,
  truncateThreadPreview,
} from '@/components/features/chat/navigation-rail/derive-thread-turns';

const webRoot = path.resolve(__dirname, '../../..');

function buildLongThread() {
  const messages = [];
  for (let turn = 0; turn < 7; turn++) {
    messages.push({
      id: `user-${turn}`,
      role: 'user' as const,
      parts: [{ type: 'text', text: `Question number ${turn + 1}` }],
      clientTurnId: `turn-${turn}`,
    });
    messages.push({
      id: `assistant-${turn}`,
      role: 'assistant' as const,
      parts: [{ type: 'text', text: `Answer number ${turn + 1}` }],
      clientTurnId: `turn-${turn}`,
    });
  }
  return messages;
}

describe('deriveThreadTurns', () => {
  it('anchors turns on user messages and truncates previews', () => {
    const turns = deriveThreadTurns([
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', text: '  Help me plan a release rollout  ' }],
      },
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Here is a rollout plan.' }],
      },
      {
        id: 'u2',
        role: 'user',
        parts: [{ type: 'text', text: '' }],
        clientTurnId: 'turn-2',
      },
      {
        id: 'a2',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Fallback preview from assistant.' }],
        clientTurnId: 'turn-2',
      },
    ]);

    expect(turns).toEqual([
      {
        id: 'u1',
        messageIndex: 0,
        preview: 'Help me plan a release rollout',
        turnNumber: 1,
      },
      {
        id: 'turn-2',
        messageIndex: 2,
        preview: 'Fallback preview from assistant.',
        turnNumber: 2,
      },
    ]);
  });

  it('truncates long previews on word boundaries', () => {
    const longText =
      'This is a very long prompt that should be shortened before it appears in the navigation rail preview tooltip for nearby turns.';
    const preview = truncateThreadPreview(longText, 48);

    expect(preview.endsWith('…')).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(48);
    expect(preview).not.toContain('  ');
  });
});

describe('ChatThreadNavigationRail', () => {
  it('stays hidden until the thread crosses the long-thread threshold', () => {
    const shortMessages = Array.from(
      { length: THREAD_NAV_RAIL_MIN_MESSAGES - 1 },
      (_, index) => ({
        id: `m-${index}`,
        role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
        parts: [{ type: 'text', text: `Message ${index}` }],
      })
    );

    const { container, rerender } = render(
      <ChatThreadNavigationRail
        messages={shortMessages}
        scrollContainerRef={{ current: null }}
        shouldVirtualizeMessages={false}
        virtualizer={{ scrollToIndex: vi.fn() } as never}
      />
    );

    expect(container).toBeEmptyDOMElement();

    rerender(
      <ChatThreadNavigationRail
        messages={buildLongThread()}
        scrollContainerRef={{ current: null }}
        shouldVirtualizeMessages
        virtualizer={{ scrollToIndex: vi.fn() } as never}
      />
    );

    expect(
      screen.getByTestId('chat-thread-navigation-rail')
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(7);
  });

  it('exposes accessible names on icon-only turn markers', () => {
    render(
      <ChatThreadNavigationRail
        messages={buildLongThread()}
        scrollContainerRef={{ current: null }}
        shouldVirtualizeMessages
        virtualizer={{ scrollToIndex: vi.fn() } as never}
      />
    );

    const markers = screen.getAllByRole('button');
    expect(markers).toHaveLength(7);
    for (const marker of markers) {
      expect(marker).toHaveAttribute('aria-label');
      expect(marker.getAttribute('aria-label')).toMatch(/^Jump to turn \d+:/);
      expect(marker.textContent?.trim()).toBe('');
    }
  });

  it('jumps to the selected turn through the virtualizer', async () => {
    const user = userEvent.setup();
    const scrollToIndex = vi.fn();
    const messages = buildLongThread();

    render(
      <ChatThreadNavigationRail
        messages={messages}
        scrollContainerRef={{ current: null }}
        shouldVirtualizeMessages
        virtualizer={{ scrollToIndex } as never}
      />
    );

    await user.click(screen.getByRole('button', { name: /Jump to turn 3:/ }));

    expect(scrollToIndex).toHaveBeenCalledWith(4, {
      align: 'start',
      behavior: 'smooth',
    });
  });
});

describe('chat thread navigation rail System B style guard', () => {
  const localChromePatterns = [
    /rounded-\[[^\]]+\]/,
    /bg-\[[^\]]+\]/,
    /shadow-\[[^\]]+\]/,
    /linear-gradient|radial-gradient|bg-gradient/,
    /\brgba?\(/,
    /#[0-9A-Fa-f]{3,8}\b/,
    /--linear-/,
  ];

  it('keeps the navigation rail on named System B primitives', () => {
    const source = readFileSync(
      path.join(
        webRoot,
        'components/features/chat/navigation-rail/ChatThreadNavigationRail.tsx'
      ),
      'utf8'
    );

    const offenders = localChromePatterns
      .filter(pattern => pattern.test(source))
      .map(pattern => pattern.toString());

    expect(offenders).toEqual([]);
    expect(source).toContain('system-b-chat-thread-navigation-rail');
    expect(source).toContain('system-b-chat-thread-nav-preview');
  });
});
