import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PopularityIcon } from './PopularityIcon';

const meta = {
  title: 'Dashboard/Organisms/Releases/Cells/PopularityIcon',
  component: PopularityIcon,
  parameters: {
    layout: 'centered',
  },
  args: {
    popularity: 72,
  },
} satisfies Meta<typeof PopularityIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const High: Story = {};

export const Medium: Story = {
  args: { popularity: 50 },
};

export const Low: Story = {
  args: { popularity: 15 },
};

export const Unknown: Story = {
  args: { popularity: null },
};
