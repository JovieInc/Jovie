import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  type ChatNavMessage,
  ChatThreadNavigationRail,
  THREAD_NAV_RAIL_MIN_MESSAGES,
} from '@/components/features/chat/navigation-rail';
import {
  createThreadTurnProjector,
  deriveThreadTurns,
  truncateThreadPreview,
} from '@/components/features/chat/navigation-rail/derive-thread-turns';

import { extractUIMessageText } from '@/lib/chat/request-validation';

const markerRender = vi.hoisted(() => vi.fn());
vi.mock('@jovie/ui', async importOriginal => {
  const actual = await importOriginal<typeof import('@jovie/ui')>();
  return {
    ...actual,
    Button: (props: ComponentProps<typeof actual.Button>) => {
      markerRender();
      return <actual.Button {...props} />;
    },
  };
});
vi.mock('@/lib/chat/request-validation', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/chat/request-validation')>();
  return {
    ...actual,
    extractUIMessageText: vi.fn(actual.extractUIMessageText),
  };
});

const webRoot = path.resolve(__dirname, '../../..');

function buildLongThread(messageCount = 14) {
  const messages: {
    id: string;
    role: 'user' | 'assistant';
    parts: { type: 'text'; text: string }[];
    clientTurnId: string;
    streamRevision?: number;
  }[] = [];
  for (let turn = 0; turn < messageCount / 2; turn++) {
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

describe('thread turn projection cache', () => {
  it.each([20, 200, 2000])(
    'parses %i-message history once across twenty assistant updates',
    count => {
      const project = createThreadTurnProjector();
      let messages = buildLongThread(count);
      const expected = deriveThreadTurns(messages);
      const extract = vi.mocked(extractUIMessageText).mockClear();
      const initial = project(messages);
      expect(initial).toEqual(expected);
      expect(extract).toHaveBeenCalledTimes(count / 2);
      for (let update = 0; update < 20; update++) {
        messages = messages.map((message, index) =>
          index === messages.length - 1
            ? { ...message, parts: [{ type: 'text', text: `Delta ${update}` }] }
            : message
        );
        expect(project(messages)).toBe(initial);
      }
      expect(extract).toHaveBeenCalledTimes(count / 2);
    }
  );

  it('updates empty-user fallback previews without reparsing other turns', () => {
    const project = createThreadTurnProjector();
    const messages = buildLongThread();
    messages[0].parts[0].text = '';
    const extract = vi.mocked(extractUIMessageText).mockClear();
    const initial = project(messages);
    expect(initial[0].preview).toBe('Answer number 1');
    expect(extract).toHaveBeenCalledTimes(8);
    for (let update = 0; update < 20; update++) {
      messages[1] = {
        ...messages[1],
        parts: [{ type: 'text', text: `Fallback ${update}` }],
      };
      expect(project(messages)[0].preview).toBe(`Fallback ${update}`);
    }
    expect(extract).toHaveBeenCalledTimes(28);
    messages[0] = {
      ...messages[0],
      parts: [{ type: 'text', text: 'User text' }],
    };
    expect(project(messages)[0].preview).toBe('User text');
    messages[0] = { ...messages[0], parts: [{ type: 'text', text: '' }] };
    expect(project(messages)[0].preview).toBe('Fallback 19');
    expect(extract).toHaveBeenCalledTimes(31); // The unused fallback was pruned.
  });

  it('invalidates replaced messages, replaced parts and aliased stream revisions', () => {
    const project = createThreadTurnProjector();
    const messages = buildLongThread();
    const extract = vi.mocked(extractUIMessageText).mockClear();
    project(messages);
    messages[0].parts[0].text = 'Replacement sharing the same parts';
    messages[0] = { ...messages[0] };
    expect(project(messages)[0].preview).toBe(
      'Replacement sharing the same parts'
    );
    expect(extract).toHaveBeenCalledTimes(8);
    messages[0].parts = [{ type: 'text', text: 'Same object with new parts' }];
    expect(project(messages)[0].preview).toBe('Same object with new parts');
    expect(extract).toHaveBeenCalledTimes(9);
    messages[0].parts[0].text = 'Same object and parts with a new revision';
    messages[0].streamRevision = 1;
    expect(project(messages)[0].preview).toBe(
      'Same object and parts with a new revision'
    );
    expect(extract).toHaveBeenCalledTimes(10);
  });

  it('matches the pure oracle across turn identities, roles and fallback boundaries', () => {
    const project = createThreadTurnProjector();
    const messages = buildLongThread();
    const emptyUser = { ...messages[0], parts: [] };
    const system: ChatNavMessage = { id: 'system', role: 'system', parts: [] };
    const scenarios: readonly ChatNavMessage[][] = [
      [
        { ...messages[0], clientTurnId: 'replacement-turn' },
        ...messages.slice(1),
      ],
      [
        { ...messages[0], id: 'replacement-id', clientTurnId: undefined },
        ...messages.slice(1),
      ],
      [{ ...messages[0], role: 'system' }, ...messages.slice(1)],
      messages,
      [system, ...messages], // Same turn IDs and order, but all indices shift.
      [emptyUser],
      [emptyUser, system, messages[1], ...messages.slice(2)],
      [
        {
          ...messages[0],
          parts: [{ type: 'text', text: `  ${'long preview '.repeat(20)} \n` }],
        },
        ...messages.slice(1),
      ],
    ];
    project(messages);
    for (const scenario of scenarios) {
      expect(project(scenario)).toEqual(deriveThreadTurns(scenario));
    }
    expect(project([emptyUser, system, messages[1]])[0].preview).toBe('Turn 1');
  });

  it('reconciles order and indices, prunes removed rows, and resets conversation scope', () => {
    const project = createThreadTurnProjector();
    const messages = buildLongThread();
    const extract = vi.mocked(extractUIMessageText).mockClear();
    const initial = project(messages, 'conversation-a');
    const reordered = [...messages.slice(2), ...messages.slice(0, 2)];
    const turns = project(reordered, 'conversation-a');
    expect(turns).not.toBe(initial);
    expect(turns[0]).toMatchObject({
      id: 'turn-1',
      messageIndex: 0,
      turnNumber: 1,
    });
    expect(turns[6]).toMatchObject({
      id: 'turn-0',
      messageIndex: 12,
      turnNumber: 7,
    });
    expect(extract).toHaveBeenCalledTimes(7);
    expect(project(reordered.slice(0, -2), 'conversation-a')).toHaveLength(6);
    const restored = project(reordered, 'conversation-a');
    expect(restored).toEqual(turns);
    expect(extract).toHaveBeenCalledTimes(8);
    const switched = project(reordered, 'conversation-b');
    expect(switched).toEqual(restored);
    expect(switched).not.toBe(restored);
    expect(extract).toHaveBeenCalledTimes(15);
    expect(project([], 'conversation-b')).toEqual([]);
    expect(project(reordered, 'conversation-b')).toEqual(restored);
    expect(extract).toHaveBeenCalledTimes(22);
  });
});

describe('ChatThreadNavigationRail', () => {
  it('stays hidden until the thread crosses the long-thread threshold', () => {
    const shortMessages = Array.from(
      { length: THREAD_NAV_RAIL_MIN_MESSAGES - 1 },
      (_, index): ChatNavMessage => ({
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

describe('navigation marker memo boundary', () => {
  it('skips marker renders during streaming while hover, focus and current scroll targets work', async () => {
    const user = userEvent.setup();
    let messages = buildLongThread();
    const scrollContainerRef = { current: document.createElement('div') };
    const firstScroll = vi.fn();
    const latestScroll = vi.fn();
    let virtualizer = { scrollToIndex: firstScroll };
    const rail = (virtual = true, scopeKey = 'conversation-a') => (
      <ChatThreadNavigationRail
        messages={messages}
        scrollContainerRef={scrollContainerRef}
        shouldVirtualizeMessages={virtual}
        virtualizer={virtualizer as never}
        scopeKey={scopeKey}
      />
    );
    markerRender.mockClear();
    const { rerender } = render(rail());
    const initialRenderCount = markerRender.mock.calls.length;
    expect(initialRenderCount).toBe(7);
    for (let update = 0; update < 20; update++) {
      messages = messages.map((message, index) =>
        index === 13
          ? {
              ...message,
              parts: [{ type: 'text', text: `Assistant ${update}` }],
            }
          : message
      );
      rerender(rail());
    }
    expect(markerRender).toHaveBeenCalledTimes(initialRenderCount);
    const marker = screen.getByRole('button', { name: /Jump to turn 3:/ });
    await user.hover(marker);
    expect(marker).toHaveTextContent('Question number 3');
    expect(markerRender.mock.calls.length).toBeGreaterThan(initialRenderCount);
    await user.unhover(marker);
    expect(marker.textContent).toBe('');
    fireEvent.focus(marker);
    expect(marker).toHaveTextContent('Question number 3');
    fireEvent.blur(marker);
    expect(marker.textContent).toBe('');

    virtualizer = { scrollToIndex: latestScroll };
    rerender(rail());
    await user.click(marker);
    expect(firstScroll).not.toHaveBeenCalled();
    expect(latestScroll).toHaveBeenLastCalledWith(4, {
      align: 'start',
      behavior: 'smooth',
    });
    messages = [...messages.slice(4), ...messages.slice(0, 4)];
    rerender(rail());
    await user.click(
      screen.getByRole('button', { name: 'Jump to turn 1: Question number 3' })
    );
    expect(latestScroll).toHaveBeenLastCalledWith(0, {
      align: 'start',
      behavior: 'smooth',
    });

    const target = document.createElement('div');
    target.dataset.index = '0';
    target.scrollIntoView = vi.fn();
    scrollContainerRef.current.append(target);
    latestScroll.mockClear();
    rerender(rail(false));
    await user.click(
      screen.getByRole('button', { name: 'Jump to turn 1: Question number 3' })
    );
    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
    expect(latestScroll).not.toHaveBeenCalled();
    rerender(rail(false, 'conversation-b'));
    expect(
      screen.getByRole('button', { name: 'Jump to turn 1: Question number 3' })
    ).not.toHaveTextContent('Question number 3');
  });

  it('updates fallback previews and marker positions even when other previews are unchanged', () => {
    let messages = buildLongThread();
    messages[0].parts[0].text = '';
    const props = {
      scrollContainerRef: { current: null },
      shouldVirtualizeMessages: true,
      virtualizer: { scrollToIndex: vi.fn() } as never,
    };
    const { rerender } = render(
      <ChatThreadNavigationRail {...props} messages={messages} />
    );
    expect(
      screen.getByRole('button', { name: 'Jump to turn 1: Answer number 1' })
    ).toBeInTheDocument();
    messages[1].parts[0].text = 'A new fallback';
    messages[1].streamRevision = 1;
    messages = [...messages];
    rerender(<ChatThreadNavigationRail {...props} messages={messages} />);
    const marker = screen.getByRole('button', {
      name: 'Jump to turn 1: A new fallback',
    });
    expect(marker).toBeInTheDocument();
    const countBeforeAppend = markerRender.mock.calls.length;
    messages = [
      ...messages,
      {
        id: 'extra-assistant',
        role: 'assistant',
        clientTurnId: 'turn-6',
        parts: [{ type: 'text', text: 'Extra answer' }],
      },
    ];
    rerender(<ChatThreadNavigationRail {...props} messages={messages} />);
    expect(markerRender).toHaveBeenCalledTimes(countBeforeAppend + 7);
    expect(screen.getAllByRole('button')).toHaveLength(7);
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
