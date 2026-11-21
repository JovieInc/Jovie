import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Download } from 'lucide-react';
import type { ReactNode } from 'react';
import { ThreadCardIconBtn } from './ThreadCardIconBtn';

/** Rendered states of the compact thread card icon button. */
const meta = {
  title: 'Shell/ThreadCardIconBtn',
  component: ThreadCardIconBtn,
  parameters: { layout: 'centered' },
  args: {
    label: 'Download',
    children: <Download className='h-3.5 w-3.5' aria-hidden='true' />,
  },
} satisfies Meta<typeof ThreadCardIconBtn>;

export default meta;
type Story = StoryObj<typeof meta>;

function RtlFrame({ children }: Readonly<{ children: ReactNode }>) {
  return <div dir='rtl'>{children}</div>;
}

function withRtlFrame(StoryFn: () => ReactNode) {
  return <RtlFrame>{StoryFn()}</RtlFrame>;
}

/** Empty: the button with no click handler is inert but still labelled. */
export const EmptyNoHandler: Story = {};

/** Long content: a long label only feeds the tooltip and aria-label. */
export const LongContentLabel: Story = {
  args: {
    label: 'Download the original lossless master of this thread attachment',
  },
};

/** Rtl: the icon button in a right-to-left toolbar. */
export const RtlToolbar: Story = { decorators: [withRtlFrame] };
