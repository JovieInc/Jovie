import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { buildDemoProfile } from '@/components/features/demo/mock-dashboard-data';
import { convertDrizzleCreatorProfileToArtist } from '@/types/db';
import { TwoStepNotificationsCTA } from './TwoStepNotificationsCTA';

const DEMO_ARTIST = convertDrizzleCreatorProfileToArtist(buildDemoProfile());

const meta = {
  title: 'Features/Profile/TwoStepNotificationsCTA',
  component: TwoStepNotificationsCTA,
  parameters: {
    layout: 'centered',
  },
  args: {
    artist: DEMO_ARTIST,
  },
} satisfies Meta<typeof TwoStepNotificationsCTA>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {};

export const Expanded: Story = {
  args: {
    startExpanded: true,
  },
};
