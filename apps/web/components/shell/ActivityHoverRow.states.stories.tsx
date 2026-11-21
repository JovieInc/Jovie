import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Sparkles, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import { ActivityHoverRow } from './ActivityHoverRow';

/** Rendered states of the activity row beyond the default story. */
const meta = {
  title: 'Shell/ActivityHoverRow/States',
  component: ActivityHoverRow,
  parameters: { layout: 'centered' },
  decorators: [
    function withRowWidth(StoryFn) {
      return <div className='w-72 bg-base p-4'>{StoryFn()}</div>;
    },
  ],
  args: {
    icon: Sparkles,
    label: 'Spotify Canvas regenerated',
    meta: '2m ago',
    onClick: fn(),
  },
} satisfies Meta<typeof ActivityHoverRow>;

export default meta;
type Story = StoryObj<typeof meta>;

function RtlFrame({ children }: Readonly<{ children: ReactNode }>) {
  return <div dir='rtl'>{children}</div>;
}

function withRtlFrame(StoryFn: () => ReactNode) {
  return <RtlFrame>{StoryFn()}</RtlFrame>;
}

/** Empty: a row with no meta caption keeps the label and icon. */
export const EmptyNoMeta: Story = { args: { meta: '' } };

/** Partial: no click handler, no running dot and no accent. */
export const PartialLabelOnly: Story = { args: { onClick: undefined } };

/** Long content: a long label truncates before the running dot and meta. */
export const LongContentTruncated: Story = {
  args: {
    label:
      'Spotify Canvas regenerated for every track on the release after the artwork changed',
    running: true,
    iconAccent: true,
  },
};

/** Rtl: icon, label and meta mirror in a right-to-left drawer. */
export const RtlRow: Story = {
  args: {
    icon: Trash2,
    danger: true,
    label: 'تم حذف الغلاف',
    meta: 'منذ دقيقتين',
  },
  decorators: [withRtlFrame],
};
