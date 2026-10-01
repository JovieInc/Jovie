import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { buildDemoProfile } from '@/components/features/demo/mock-dashboard-data';
import { convertDrizzleCreatorProfileToArtist } from '@/types/db';
import { ReleaseNotificationsProvider } from './ReleaseNotificationsProvider';

const DEMO_ARTIST = convertDrizzleCreatorProfileToArtist(buildDemoProfile());

const meta = {
  title: 'Features/Release/ReleaseNotificationsProvider',
  component: ReleaseNotificationsProvider,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Sets up ProfileNotificationsContext standalone, so ArtistNotificationsCTA can run on release pages without the full ProfileShell.',
      },
    },
  },
  args: {
    artist: DEMO_ARTIST,
  },
} satisfies Meta<typeof ReleaseNotificationsProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <div className='rounded-lg border border-subtle p-4 text-sm text-primary-token'>
        Release page content
      </div>
    ),
  },
};
