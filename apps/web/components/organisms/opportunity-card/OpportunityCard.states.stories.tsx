import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import { OpportunityCard } from './OpportunityCard';

function Frame(Story: () => ReactNode) {
  return (
    <div className='w-64'>
      <Story />
    </div>
  );
}

function Frame2(Story: () => ReactNode) {
  return (
    <div className='w-full max-w-md'>
      <Story />
    </div>
  );
}

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/**
 * State coverage for the opportunity card. The Compact, Editorial and
 * CompactDisabled stories stay in OpportunityCard.stories.tsx; these change
 * how much the card carries and the document direction.
 */
const meta = {
  title: 'Organisms/OpportunityCard States',
  component: OpportunityCard,
  args: {
    format: 'compact',
    title: 'Review your release checklist',
    description: 'Check artwork, credits and links before the release.',
    icon: <Sparkles className='size-3.5' />,
    onSelect: fn(),
  },
} satisfies Meta<typeof OpportunityCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: an editorial card with no metadata line and no action yet. */
export const PartialEditorialNoMetadata: Story = {
  args: {
    format: 'editorial',
    title: 'Review your release checklist',
    description: 'Check artwork, credits and links before the release.',
    icon: <Sparkles className='size-3.5' />,
    metadata: null,
    children: null,
  },
};

const LONG_TITLE =
  'Review the release checklist for the extended deluxe edition with bonus remixes and live recordings';
const LONG_DESCRIPTION =
  'Check artwork, credits, writer splits, ISRC codes and every streaming link before the release goes out to all stores, so nothing has to be pulled and resubmitted after launch day.';

/** Long content: a compact row truncates its title inside a narrow column. */
export const LongContentCompact: Story = {
  args: {
    format: 'compact',
    title: LONG_TITLE,
    description: LONG_DESCRIPTION,
    icon: <Sparkles className='size-3.5' />,
    onSelect: fn(),
  },
  decorators: [Frame],
};

/** Long content: an editorial card wraps a long title and description. */
export const LongContentEditorial: Story = {
  args: {
    format: 'editorial',
    title: LONG_TITLE,
    description: LONG_DESCRIPTION,
    icon: <Sparkles className='size-3.5' />,
    metadata: <span>Release review · Deluxe edition</span>,
    children: (
      <Button size='sm' onClick={fn()}>
        Review Release
      </Button>
    ),
  },
  decorators: [Frame2],
};

/** Right-to-left: an editorial card inside an RTL document. */
export const RtlEditorial: Story = {
  args: {
    format: 'editorial',
    title: 'راجع قائمة الإصدار',
    description: 'تحقق من الغلاف والاعتمادات والروابط قبل الإصدار.',
    icon: <Sparkles className='size-3.5' />,
    metadata: <span>مراجعة الإصدار</span>,
    children: (
      <Button size='sm' onClick={fn()}>
        راجع
      </Button>
    ),
  },
  decorators: [RtlFrame],
};
