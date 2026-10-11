import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { buildReleaseShareContext } from '@/lib/share/context';
import { PublicShareMenu } from './PublicShareMenu';

const context = buildReleaseShareContext({
  username: 'timwhite',
  slug: 'midnight-drive',
  title: 'Midnight Drive',
  artistName: 'Tim White',
  artworkUrl: 'https://example.com/artwork.png',
  pathname: '/timwhite/midnight-drive',
});

const meta: Meta<typeof PublicShareMenu> = {
  title: 'Features/Share/PublicShareMenu',
  component: PublicShareMenu,
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    triggerVariant: {
      control: { type: 'select' },
      options: ['pill', 'text'],
    },
    align: {
      control: { type: 'select' },
      options: ['start', 'center', 'end'],
    },
  },
  args: {
    context,
  },
};

export default meta;

type Story = StoryObj<typeof PublicShareMenu>;

export const Pill: Story = {};

export const TextTrigger: Story = {
  args: {
    triggerVariant: 'text',
  },
};
