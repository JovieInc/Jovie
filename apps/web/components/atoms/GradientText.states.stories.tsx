import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { GradientText } from './GradientText';

const meta = {
  title: 'Atoms/GradientText/States',
  component: GradientText,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof GradientText>;

export default meta;
type Story = StoryObj<typeof meta>;

function GradientStateFrame({
  children,
  dir,
}: {
  readonly children: React.ReactNode;
  readonly dir?: 'rtl';
}) {
  return (
    <div dir={dir} className='w-full max-w-sm text-2xl font-semibold'>
      {children}
    </div>
  );
}

/** Partial: only the accent word of a headline carries the gradient. */
export const PartialAccentWord: Story = {
  args: { children: 'audience' },
  render: args => (
    <GradientStateFrame>
      Grow your <GradientText {...args} /> faster
    </GradientStateFrame>
  ),
};

/** Long content: a gradient run that wraps across several lines. */
export const LongContentWrapping: Story = {
  args: {
    children:
      'Every release, every playlist pitch and every fan conversation in one workspace built for independent artists',
  },
  render: args => (
    <GradientStateFrame>
      <GradientText {...args} />
    </GradientStateFrame>
  ),
};

/** Rtl: the gradient text inside a right-to-left container. */
export const RtlGradient: Story = {
  args: { children: 'نمِّ جمهورك' },
  render: args => (
    <GradientStateFrame dir='rtl'>
      <GradientText {...args} />
    </GradientStateFrame>
  ),
};
