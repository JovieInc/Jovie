import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfileAboutTab } from './ProfileAboutTab';

const meta = {
  title: 'Features/Dashboard/Organisms/ProfileContactSidebar/ProfileAboutTab',
  component: ProfileAboutTab,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: [
        'bio',
        'genres',
        'location',
        'hometown',
        'activeSinceYear',
        'allowPhotoDownloads',
        'showOldReleases',
        'disabled',
      ],
    },
  },
} satisfies Meta<typeof ProfileAboutTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    bio: 'Independent artist writing pop songs about growing up.',
    genres: ['pop', 'indie'],
    location: 'Los Angeles, CA',
    hometown: 'Austin, TX',
    activeSinceYear: 2019,
    allowPhotoDownloads: true,
    showOldReleases: true,
  },
};
