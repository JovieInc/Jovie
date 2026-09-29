import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomeRelationshipPanel } from './HomeRelationshipPanel';

const meta = {
  title: 'Features/Home/HomeRelationshipPanel',
  component: HomeRelationshipPanel,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof HomeRelationshipPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
