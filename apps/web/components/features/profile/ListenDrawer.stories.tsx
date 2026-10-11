import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { buildDemoProfile } from '@/components/features/demo/mock-dashboard-data';
import { getAvailableDSPs } from '@/lib/dsp';
import { convertDrizzleCreatorProfileToArtist } from '@/types/db';
import { ListenDrawer } from './ListenDrawer';

const DEMO_ARTIST = convertDrizzleCreatorProfileToArtist(buildDemoProfile());

const meta = {
  title: 'Features/Profile/ListenDrawer',
  component: ListenDrawer,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    open: true,
    onOpenChange: () => {},
    artist: DEMO_ARTIST,
    dsps: getAvailableDSPs(DEMO_ARTIST),
  },
} satisfies Meta<typeof ListenDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};
