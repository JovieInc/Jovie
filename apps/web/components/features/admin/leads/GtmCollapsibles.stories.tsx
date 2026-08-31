import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { GtmCollapsibles } from './GtmCollapsibles';

const meta = {
  title: 'Features/Admin/Leads/GtmCollapsibles',
  component: GtmCollapsibles,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['title', 'isOpen', 'onToggle'],
    },
  },
} satisfies Meta<typeof GtmCollapsibles>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
