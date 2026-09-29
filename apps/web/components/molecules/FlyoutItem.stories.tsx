import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FEATURES } from '@/lib/features';
import { FlyoutItem } from './FlyoutItem';

const meta: Meta<typeof FlyoutItem> = {
  title: 'Molecules/FlyoutItem',
  component: FlyoutItem,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    feature: FEATURES[1],
  },
};

export const AiPowered: Story = {
  args: {
    feature: FEATURES[0],
  },
};
