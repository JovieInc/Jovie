import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { PublicSurfaceFooter } from './PublicSurfaceFooter';

function Frame(Story: () => ReactNode) {
  return (
    <div className='w-80 bg-surface-0'>
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
 * State coverage for the public surface footer slot. The Default story stays
 * in PublicSurfaceFooter.stories.tsx; these change the slotted content and
 * the document direction.
 */
const meta = {
  title: 'Organisms/PublicSurface/PublicSurfaceFooter States',
  component: PublicSurfaceFooter,
  parameters: {
    layout: 'centered',
  },
  decorators: [Frame],
  args: {
    children: (
      <p className='text-center text-sm text-secondary-token'>Footer content</p>
    ),
  },
} satisfies Meta<typeof PublicSurfaceFooter>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: several lines of footer copy wrap inside the slot. */
export const LongContentFooter: Story = {
  args: {
    children: (
      <p className='text-center text-sm text-secondary-token'>
        Footer content that runs long enough to wrap over several lines, so the
        safe-area padding under it can be checked on a narrow phone screen.
      </p>
    ),
  },
};

/** Right-to-left: Arabic footer copy inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    children: (
      <p className='text-center text-sm text-secondary-token'>محتوى التذييل</p>
    ),
  },
  decorators: [RtlFrame],
};
