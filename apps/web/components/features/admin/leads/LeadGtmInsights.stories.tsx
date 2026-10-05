import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, use } from 'react';
import { LeadGtmInsights as LeadGtmInsightsAsync } from './LeadGtmInsights';

// LeadGtmInsights is an async server component. The promise lives outside
// render: React discards hook state while a first mount suspends, so a
// promise created in render would be new on every retry.
let insights: Promise<ReactNode> | null = null;

function LeadGtmInsights() {
  insights ??= LeadGtmInsightsAsync();
  return use(insights);
}

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
