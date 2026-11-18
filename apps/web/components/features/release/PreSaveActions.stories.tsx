import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { buildDemoProfile } from '@/components/features/demo/mock-dashboard-data';
import { convertDrizzleCreatorProfileToArtist } from '@/types/db';
import { PreSaveActions } from './PreSaveActions';

const DEMO_ARTIST = convertDrizzleCreatorProfileToArtist(buildDemoProfile());

const meta = {
  title: 'Features/Release/PreSaveActions',
  component: PreSaveActions,
  parameters: {
    layout: 'centered',
  },
  args: {
    releaseDate: new Date(Date.now() + 7 * 86_400_000),
    artistData: DEMO_ARTIST,
  },
} satisfies Meta<typeof PreSaveActions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * The release time has passed but the page has not refreshed yet: the
 * countdown renders nothing inside its pill while the router refreshes.
 */
export const EmptyCountdownElapsed: Story = {
  args: {
    releaseDate: new Date(Date.now() - 60_000),
  },
};
