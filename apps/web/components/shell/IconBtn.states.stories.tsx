import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Play } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconBtn } from './IconBtn';

/** Rendered states of the shell icon button beyond the default stories. */
const meta = {
  title: 'Shell/IconBtn/States',
  component: IconBtn,
  parameters: { layout: 'centered' },
  args: { label: 'Play', children: <Play /> },
} satisfies Meta<typeof IconBtn>;

export default meta;
type Story = StoryObj<typeof meta>;

function RtlFrame({ children }: Readonly<{ children: ReactNode }>) {
  return <div dir='rtl'>{children}</div>;
}

function withRtlFrame(StoryFn: () => ReactNode) {
  return <RtlFrame>{StoryFn()}</RtlFrame>;
}

/** Partial: label and icon only, with no handler, shortcut or test id. */
export const PartialLabelOnly: Story = {};

/** Long content: a long label only feeds the tooltip and aria-label. */
export const LongContentLabel: Story = {
  args: {
    label: 'Play the full track from the beginning in the global player',
    tone: 'ghost',
    active: true,
  },
};

/** Rtl: the icon button in a right-to-left toolbar. */
export const RtlToolbar: Story = { decorators: [withRtlFrame] };
