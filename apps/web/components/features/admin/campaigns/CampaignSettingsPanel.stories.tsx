import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CampaignSettingsPanel } from './CampaignSettingsPanel';

const meta = {
  title: 'Features/Admin/CampaignSettingsPanel',
  component: CampaignSettingsPanel,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Reads/writes campaign settings via useCampaignSettings. Storybook has no backend, so this renders the documented error state — the same one a real network failure produces in production.',
      },
    },
  },
} satisfies Meta<typeof CampaignSettingsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LoadFailed: Story = {};
