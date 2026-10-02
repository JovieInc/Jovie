import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ReleaseCreditsDrawer } from './ReleaseCreditsDrawer';

const meta = {
  title: 'Release/ReleaseCreditsDrawer',
  component: ReleaseCreditsDrawer,
  parameters: { layout: 'fullscreen', backgrounds: { default: 'dark' } },
  args: {
    open: true,
    onOpenChange: fn(),
    presentation: 'modal',
    credits: [
      {
        role: 'producer',
        label: 'PRODUCER',
        entries: [
          {
            artistId: 'ada',
            name: 'Ada Lovelace',
            handle: 'ada',
            role: 'producer',
            position: 0,
          },
          {
            artistId: 'grace',
            name: 'Grace Hopper',
            handle: null,
            role: 'producer',
            position: 1,
          },
        ],
      },
      {
        role: 'composer',
        label: 'COMPOSER',
        entries: [
          {
            artistId: 'katherine',
            name: 'Katherine Johnson',
            handle: null,
            role: 'composer',
            position: 0,
          },
        ],
      },
    ],
  },
} satisfies Meta<typeof ReleaseCreditsDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Closed: Story = {
  args: { open: false },
};
