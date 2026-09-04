import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LeadGtmInsights } from './LeadGtmInsights';

const meta = {
  title: 'Features/Admin/Leads/LeadGtmInsights',
  component: LeadGtmInsights,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof LeadGtmInsights>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
