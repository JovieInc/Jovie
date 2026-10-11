import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { buildDemoProfile } from '@/components/features/demo/mock-dashboard-data';
import { convertDrizzleCreatorProfileToArtist } from '@/types/db';
import { ArtistThemeProvider } from './ArtistThemeProvider';

const DEMO_ARTIST = convertDrizzleCreatorProfileToArtist(buildDemoProfile());

const meta = {
  title: 'Features/Profile/ArtistThemeProvider',
  component: ArtistThemeProvider,
  parameters: {
    layout: 'centered',
  },
  args: {
    artist: DEMO_ARTIST,
    children: (
      <div className='rounded-lg border border-subtle p-4 text-sm text-primary-token'>
        Profile content
      </div>
    ),
  },
} satisfies Meta<typeof ArtistThemeProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
