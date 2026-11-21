import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  type CampaignSettingsResponse,
  DEFAULT_THROTTLING,
  queryKeys,
} from '@/lib/queries';
import { CampaignSettingsPanel } from './CampaignSettingsPanel';

const settings: CampaignSettingsResponse = {
  ok: true,
  settings: {
    fitScoreThreshold: 60,
    batchLimit: 25,
    throttlingConfig: DEFAULT_THROTTLING,
    updatedAt: null,
    updatedBy: null,
  },
};

function seededClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(queryKeys.campaign.settings(), settings);
  return client;
}

const meta = {
  title: 'Features/Admin/CampaignSettingsPanel/States',
  component: CampaignSettingsPanel,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof CampaignSettingsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: the settings request fails, which is what Storybook's missing backend produces. */
export const ErrorLoadFailed: Story = {};

/** Right-to-left: loaded settings in an RTL admin page. */
export const RtlLoadedSettings: Story = {
  decorators: [
    function RtlSeededFrame(Story) {
      return (
        <QueryClientProvider client={seededClient()}>
          <div dir='rtl'>
            <Story />
          </div>
        </QueryClientProvider>
      );
    },
  ],
};
