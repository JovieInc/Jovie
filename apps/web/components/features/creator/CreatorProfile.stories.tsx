import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import { CreatorProfile } from './CreatorProfile';

const meta = {
  title: 'Features/Creator/CreatorProfile',
  component: CreatorProfile,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Fetches a creator by username via usePublicProfileQuery. Storybook has no backend, so this renders the documented error state (`Failed to load creator profile`) — the same state a real 404/network failure produces in production.',
      },
    },
  },
  args: {
    username: TIM_WHITE_PROFILE.handle,
  },
} satisfies Meta<typeof CreatorProfile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotFoundOrLoading: Story = {};
