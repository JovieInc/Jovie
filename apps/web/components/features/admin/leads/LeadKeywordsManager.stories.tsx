import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LeadKeywordsManager } from './LeadKeywordsManager';

const meta = {
  title: 'Features/Admin/Leads/LeadKeywordsManager',
  component: LeadKeywordsManager,
  parameters: {
    jovie: {
      uncoveredProps: ['disabled'],
    },
    layout: 'centered',
  },
} satisfies Meta<typeof LeadKeywordsManager>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
