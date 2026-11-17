import type { Virtualizer } from '@tanstack/react-virtual';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  ChatThreadNavigationRail,
  THREAD_NAV_RAIL_MIN_MESSAGES,
} from './ChatThreadNavigationRail';
import type { ChatNavMessage } from './types';

function thread(
  turns: number,
  userText: (turn: number) => string = turn => `Question number ${turn}`
): ChatNavMessage[] {
  return Array.from({ length: turns * 2 }, (_, i) => {
    const turn = Math.floor(i / 2) + 1;
    const role = i % 2 === 0 ? 'user' : 'assistant';
    return {
      id: `msg-${i}`,
      role,
      parts: [
        {
          type: 'text',
          text: role === 'user' ? userText(turn) : `Answer number ${turn}`,
        },
      ],
    };
  });
}

function renderRail(
  messages: readonly ChatNavMessage[],
  {
    virtualize = false,
    dir,
  }: { readonly virtualize?: boolean; readonly dir?: 'rtl' } = {}
) {
  const scrollToIndex = vi.fn();
  const virtualizer = { scrollToIndex } as unknown as Virtualizer<
    HTMLDivElement,
    Element
  >;
  const scrollContainerRef = createRef<HTMLDivElement>();
  const view = render(
    <div dir={dir}>
      <div ref={scrollContainerRef}>
        {messages.map((message, index) => (
          <div key={message.id} data-index={index} />
        ))}
      </div>
      <ChatThreadNavigationRail
        messages={messages}
        scrollContainerRef={scrollContainerRef}
        shouldVirtualizeMessages={virtualize}
        virtualizer={virtualizer}
      />
    </div>
  );
  return { ...view, scrollToIndex, scrollContainerRef };
}

describe('ChatThreadNavigationRail', () => {
  it('renders no rail for a thread too short to navigate', async () => {
    const { container } = renderRail(
      thread(Math.floor((THREAD_NAV_RAIL_MIN_MESSAGES - 1) / 2))
    );
    expect(screen.queryByRole('navigation')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('jumps to a turn through the virtualizer when messages are virtualized', async () => {
    const { container, scrollToIndex } = renderRail(thread(8), {
      virtualize: true,
    });
    const nav = screen.getByRole('navigation', { name: 'Thread Turns' });
    expect(nav.querySelectorAll('button')).toHaveLength(8);
    await expectNoA11yViolations(container);

    await userEvent.click(
      screen.getByRole('button', { name: 'Jump to turn 3: Question number 3' })
    );
    expect(scrollToIndex).toHaveBeenCalledWith(4, {
      align: 'start',
      behavior: 'smooth',
    });
  });

  it('scrolls the rendered message into view without virtualization', () => {
    const { scrollContainerRef } = renderRail(thread(8));
    const target = scrollContainerRef.current?.querySelector(
      '[data-index="2"]'
    ) as HTMLElement;
    target.scrollIntoView = vi.fn();

    fireEvent.click(
      screen.getByRole('button', { name: 'Jump to turn 2: Question number 2' })
    );
    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
  });

  it('shows a hover preview and hides it again on blur', () => {
    renderRail(thread(8));
    const marker = screen.getByRole('button', {
      name: 'Jump to turn 5: Question number 5',
    });
    fireEvent.focus(marker);
    expect(marker).toHaveTextContent('Turn 5');
    fireEvent.blur(marker);
    expect(marker).not.toHaveTextContent('Turn 5');
  });

  it('truncates long turn previews in marker names', async () => {
    const longQuestion =
      'Can you compare every release in the catalog against last quarter, split by platform, country and playlist placement, and tell me which ones need a new pitch?';
    const { container } = renderRail(thread(20, () => longQuestion));
    const markers = screen.getAllByRole('button', { name: /^Jump to turn/ });
    expect(markers).toHaveLength(20);
    const name = markers[0].getAttribute('aria-label') ?? '';
    expect(name.length).toBeLessThan(`Jump to turn 1: ${longQuestion}`.length);
    await expectNoA11yViolations(container);
  });

  it('stays accessible right to left', async () => {
    const { container } = renderRail(
      thread(8, turn => `الجولة ${turn}: كيف يؤدي أحدث إصدار لي هذا الأسبوع؟`),
      { dir: 'rtl' }
    );
    expect(
      screen.getByRole('button', { name: /^Jump to turn 1: الجولة 1/ })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
