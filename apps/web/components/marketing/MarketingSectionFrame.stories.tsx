import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingSectionFrame } from './MarketingSectionFrame';

const meta = {
  title: 'Marketing/Primitives/MarketingSectionFrame',
  component: MarketingSectionFrame,
  parameters: { layout: 'fullscreen' },
  args: {
    eyebrow: 'Release control',
    children: (
      <div className='grid gap-8 md:grid-cols-2'>
        <h2 className='marketing-h2-linear text-primary-token'>
          Know what ships next.
        </h2>
        <p className='marketing-lead-linear text-secondary-token'>
          Keep release dates, assets, and the next useful action in one clear
          view.
        </p>
      </div>
    ),
  },
  render: args => (
    <main className='bg-base text-primary-token'>
      <MarketingSectionFrame {...args} />
    </main>
  ),
} satisfies Meta<typeof MarketingSectionFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Reversed: Story = {
  args: { reverse: true },
};

export const WithoutEyebrow: Story = {
  args: { eyebrow: undefined },
};
