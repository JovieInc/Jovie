import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { IGComparisonAside } from './IGComparisonAside';

const meta = {
  title: 'Marketing/IGComparisonAside',
  component: IGComparisonAside,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof IGComparisonAside>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
