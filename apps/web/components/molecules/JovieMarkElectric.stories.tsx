import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { JovieMarkElectric } from './JovieMarkElectric';

const meta = {
  title: 'Molecules/JovieMarkElectric',
  component: JovieMarkElectric,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
  args: {
    size: 128,
    idSeed: 'storybook-jovie-mark',
  },
} satisfies Meta<typeof JovieMarkElectric>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SettledTrace: Story = {
  args: {
    settledSpark: true,
  },
};

export const Static: Story = {
  args: {
    spark: false,
    settledSpark: true,
  },
};

/** Partial: no pixel size, so the mark fills whatever box its host gives it. */
export const PartialFillsContainer: Story = {
  args: { size: undefined, spark: false },
  decorators: [
    function FillDecorator(Story) {
      return (
        <div className='size-32'>
          <Story />
        </div>
      );
    },
  ],
};
