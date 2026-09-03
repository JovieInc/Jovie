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

export const Default: Story = {};
