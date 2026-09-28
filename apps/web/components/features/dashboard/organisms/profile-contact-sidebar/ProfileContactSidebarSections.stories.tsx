import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { PreviewPanelData } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { ProfileBentoView } from './ProfileContactSidebarSections';

const previewData: PreviewPanelData = {
  username: 'alex',
  displayName: 'Alex Rivera',
  avatarUrl: null,
  bio: 'Independent artist',
  genres: null,
  location: null,
  hometown: null,
  links: [],
  profilePath: '/alex',
  dspConnections: {
    spotify: { connected: false, artistName: null },
    appleMusic: { connected: false, artistName: null },
  },
};

const meta = {
  title: 'Features/Dashboard/ProfileContactSidebar/ProfileBentoView',
  component: ProfileBentoView,
  args: {
    previewData,
    profileUrl: 'https://jov.ie/alex',
    onManageConnections: fn(),
  },
} satisfies Meta<typeof ProfileBentoView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
