import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ConfettiOverlay } from './Confetti';

/** Rendered states of the confetti overlay, beside Confetti.stories.tsx. */
const meta = {
  title: 'Atoms/Confetti States',
  component: ConfettiOverlay,
  parameters: {
    layout: 'centered',
  },
  args: {
    count: 40,
  },
  render: args => (
    <div className='relative h-64 w-96 overflow-hidden rounded-lg border border-subtle bg-surface-1'>
      <ConfettiOverlay {...args} />
    </div>
  ),
} satisfies Meta<typeof ConfettiOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a zero count paints the frame with no particles. */
export const EmptyZeroParticles: Story = {
  args: {
    count: 0,
  },
};

/** Partial: a single colour and only a handful of particles. */
export const PartialSingleColor: Story = {
  args: {
    count: 6,
    colors: ['var(--color-accent)'],
  },
};

/** Long content: a dense burst well past the default count. */
export const ManyParticles: Story = {
  args: {
    count: 160,
  },
};

/** Right-to-left: the decorative overlay is unchanged on an Arabic page. */
export const RtlArabicPage: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
