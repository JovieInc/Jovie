import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { resolveProfileModeCardAccents } from '@/lib/profile/mode-card-accent';
import { ProfileEventsCard } from './ProfileEventsCard';

const meta = {
  title: 'Profile/ProfileEventsCard',
  component: ProfileEventsCard,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-sm max-w-full bg-base p-4'>
        <Story />
      </div>
    ),
  ],
  args: {
    accent: resolveProfileModeCardAccents({ listenArtworkAccent: 'ultra' })
      .events,
    hasEvents: false,
  },
} satisfies Meta<typeof ProfileEventsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const WithEvents: Story = {
  args: {
    hasEvents: true,
    children: (
      <p className='text-mid text-(--profile-mode-card-fg)'>
        May 1 · The Echo, Los Angeles
      </p>
    ),
  },
};
