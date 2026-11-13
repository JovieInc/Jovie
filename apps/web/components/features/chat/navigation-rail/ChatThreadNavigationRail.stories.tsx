import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { Virtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import { ChatThreadNavigationRail } from './ChatThreadNavigationRail';
import type { ChatNavMessage } from './types';

// 8 turns / 16 messages — above THREAD_NAV_RAIL_MIN_MESSAGES (13) and
// THREAD_NAV_RAIL_MIN_TURNS (2) so the rail actually renders.
const MESSAGES: ChatNavMessage[] = Array.from({ length: 16 }, (_, i) => {
  const turn = Math.floor(i / 2) + 1;
  const role = i % 2 === 0 ? 'user' : 'assistant';
  const text =
    role === 'user'
      ? `Turn ${turn}: what's my top release doing this week?`
      : `Turn ${turn}: streams are up and two shows sold out nearby.`;
  return {
    id: `msg-${i}`,
    role,
    parts: [{ type: 'text', text }],
  };
});

const STUB_VIRTUALIZER = {} as Virtualizer<HTMLDivElement, Element>;

function RailHarness(
  props: Omit<
    React.ComponentProps<typeof ChatThreadNavigationRail>,
    'scrollContainerRef'
  >
) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={scrollContainerRef}
      className='relative h-96 w-full max-w-md overflow-y-auto border border-subtle'
    >
      <ChatThreadNavigationRail
        {...props}
        scrollContainerRef={scrollContainerRef}
      />
    </div>
  );
}

const meta = {
  title: 'Features/Chat/ChatThreadNavigationRail',
  component: RailHarness,
  parameters: {
    layout: 'centered',
  },
  args: {
    messages: MESSAGES,
    shouldVirtualizeMessages: false,
    virtualizer: STUB_VIRTUALIZER,
  },
} satisfies Meta<typeof RailHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EightTurns: Story = {};

function thread(
  turns: number,
  userText: (turn: number) => string,
  assistantText: (turn: number) => string
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
          text: role === 'user' ? userText(turn) : assistantText(turn),
        },
      ],
    };
  });
}

/** A short thread (below 13 messages) has nothing to navigate: no rail. */
export const EmptyShortThread: Story = {
  args: {
    messages: MESSAGES.slice(0, 6),
  },
};

/** Twenty turns of long questions: markers stay evenly spaced, previews truncate. */
export const LongContentManyTurns: Story = {
  args: {
    messages: thread(
      20,
      turn =>
        `Turn ${turn}: can you compare every release in the catalog against last quarter, split by platform, country and playlist placement, and tell me which ones need a new pitch before the summer festival run?`,
      turn => `Turn ${turn}: here is the full breakdown you asked for.`
    ),
  },
};

export const RtlTurns: Story = {
  args: {
    messages: thread(
      8,
      turn => `الجولة ${turn}: كيف يؤدي أحدث إصدار لي هذا الأسبوع؟`,
      turn => `الجولة ${turn}: ارتفعت مرات الاستماع وبيعت تذاكر حفلتين.`
    ),
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
