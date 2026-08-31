import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatStyleLinkItem } from './ChatStyleLinkItem';

const meta = {
  title: 'Features/Dashboard/Organisms/Links/ChatStyleLinkItem',
  component: ChatStyleLinkItem,
  parameters: {
    jovie: {
      uncoveredProps: ['disabled'],
    },
    layout: 'centered',
  },
} satisfies Meta<typeof ChatStyleLinkItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
