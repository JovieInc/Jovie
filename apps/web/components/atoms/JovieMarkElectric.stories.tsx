import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { JovieMarkElectric } from './JovieMarkElectric';

const meta = {
  title: 'Atoms/JovieMarkElectric',
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
