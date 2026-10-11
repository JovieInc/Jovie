import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { resolveProfileModeCardAccents } from '@/lib/profile/mode-card-accent';
import { ProfileModeCard, ProfileModeCardAction } from './ProfileModeCard';

const ACCENTS = resolveProfileModeCardAccents({ listenArtworkAccent: 'ultra' });

const meta = {
  title: 'Profile/ProfileModeCard',
  component: ProfileModeCard,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-sm max-w-full bg-base p-4'>
        <Story />
      </div>
    ),
  ],
  args: {
    accent: ACCENTS.events,
    eyebrow: 'Events',
    title: 'No upcoming events',
    description: 'New dates will appear here.',
  },
} satisfies Meta<typeof ProfileModeCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EventsEmpty: Story = {};

export const WithAction: Story = {
  args: {
    accent: ACCENTS['stay-close'],
    eyebrow: 'Stay close',
    title: 'Stay in touch',
    description: 'Notes from Tim White, straight to your inbox.',
    eyebrowAside: null,
    ariaLabel: 'Stay close',
    className: undefined,
    dataTestId: 'profile-mode-card-story',
    media: null,
    children: (
      <ProfileModeCardAction href='/timwhite/alerts'>
        Get alerts
      </ProfileModeCardAction>
    ),
  },
};
