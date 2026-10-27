import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { buildProfileShareContext } from '@/lib/share/context';
import type { PublicContact } from '@/types/contacts';
import { ProfileDrawerShell } from './ProfileDrawerShell';
import drawerMeta from './ProfileUnifiedDrawer.stories';
import { ProfileUnifiedDrawerContent } from './ProfileUnifiedDrawerContent';

const meta = {
  title: 'Profile/ProfileUnifiedDrawerContent',
  component: ProfileUnifiedDrawerContent,
  parameters: drawerMeta.parameters,
  decorators: [
    Story => (
      <ProfileDrawerShell open onOpenChange={() => {}} title='Menu'>
        <Story />
      </ProfileDrawerShell>
    ),
  ],
  args: {
    ...drawerMeta.args,
    primaryChannel: (contact: PublicContact) =>
      contact.channels[0] ?? {
        type: 'email',
        encoded: 'bW9va0BleGFtcGxlLmNvbQ==',
      },
    shareContext: buildProfileShareContext({
      username: drawerMeta.args.artist.handle,
      artistName: drawerMeta.args.artist.name,
      avatarUrl: drawerMeta.args.artist.image_url,
    }),
    view: 'menu',
    renderedView: 'menu',
    visibleReleases: [],
    canOpenReleasesDrawer: false,
    canOpenTourDrawer: false,
  },
} satisfies Meta<typeof ProfileUnifiedDrawerContent>;

export default meta;

export const Menu: StoryObj<typeof meta> = {};
