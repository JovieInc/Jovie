import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import { HomepageIdentityLenses } from './HomepageIdentityLenses';

const meta = {
  title: 'Marketing/HomepageIdentityLenses',
  component: HomepageIdentityLenses,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Bounded "You are not one thing." treatment inside the relationships chapter. One approved subject stays constant while the caption emphasis switches across at most three contextual lenses.',
      },
    },
  },
  args: {
    identity: HOMEPAGE_LAUNCH_COPY.certified.identity,
  },
} satisfies Meta<typeof HomepageIdentityLenses>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
