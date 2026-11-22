import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { STORYBOOK_LEAD_FUNNEL_REPORT } from '@/.storybook/leads-reporting-mock';
import { LeadGtmInsightsView } from './LeadGtmInsights';

const meta = {
  title: 'Features/Admin/Leads/LeadGtmInsights',
  component: LeadGtmInsightsView,
  parameters: {
    layout: 'centered',
  },
  args: { report: STORYBOOK_LEAD_FUNNEL_REPORT },
} satisfies Meta<typeof LeadGtmInsightsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
