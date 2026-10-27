import type { Meta, StoryObj } from '@storybook/nextjs-vite';
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
    view: 'menu',
    renderedView: 'menu',
    visibleReleases: [],
    canOpenReleasesDrawer: false,
    canOpenTourDrawer: false,
  },
} satisfies Meta<typeof ProfileUnifiedDrawerContent>;

export default meta;

export const Menu: StoryObj<typeof meta> = {};
