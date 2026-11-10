import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  HomepageInviteClose,
  HomepageProfileChapter,
  HomepageReleasesChapter,
  HomepageStoryHero,
} from './HomepageEditorial';

/**
 * The editorial homepage (Tim, 2026-11-03): the locked line, the jov.ie/you
 * profile, the releases workspace, then the role waitlist form.
 */
const meta = {
  title: 'Marketing/HomepageEditorial',
  component: HomepageStoryHero,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Invite-only homepage chapters. The hero action scrolls to the on-page role waitlist form; product imagery comes from the screenshot registry.',
      },
    },
  },
} satisfies Meta<typeof HomepageStoryHero>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Hero: Story = {};

export const Profile: Story = {
  render: () => <HomepageProfileChapter />,
};

export const Releases: Story = {
  render: () => <HomepageReleasesChapter />,
};

export const InviteClose: Story = {
  render: () => <HomepageInviteClose />,
};
