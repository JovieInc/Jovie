import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  createDashboardQueryClient,
  DashboardStoryProviders,
} from '@/.storybook/dashboard-fixtures';
import { queryKeys } from '@/lib/queries/keys';
import type { YouTubeVerificationView } from '@/lib/queries/useYouTubeVerificationQuery';
import { YouTubeVerifyCard } from './YouTubeVerifyCard';

const channel = {
  title: 'Lena Hart',
  url: 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv',
};

const meta = {
  title: 'Dashboard/ProfileContactSidebar/YouTubeVerifyCard',
  component: YouTubeVerifyCard,
  parameters: {
    layout: 'padded',
    view: { state: 'unverified', channel } satisfies YouTubeVerificationView,
  },
  args: { profileId: 'story-profile' },
  decorators: [
    (Story, context) => {
      const client = createDashboardQueryClient();
      client.setQueryData(
        queryKeys.youtubeVerification.profile(context.args.profileId),
        context.parameters.view as YouTubeVerificationView
      );
      return (
        <DashboardStoryProviders queryClient={client}>
          <div className='w-72'>
            <Story />
          </div>
        </DashboardStoryProviders>
      );
    },
  ],
} satisfies Meta<typeof YouTubeVerifyCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unverified: Story = {};

export const Verified: Story = {
  parameters: { view: { state: 'verified', channel } },
};

export const NoCandidate: Story = {
  parameters: { view: { state: 'none', channel: null } },
};
