import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InviteCampaignManager } from './InviteCampaignManager';

const meta = {
  title: 'Features/Admin/Campaigns/InviteCampaignManager',
  component: InviteCampaignManager,
  parameters: {
    jovie: {
      uncoveredProps: ['isLoading'],
    },
    layout: 'centered',
  },
} satisfies Meta<typeof InviteCampaignManager>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
