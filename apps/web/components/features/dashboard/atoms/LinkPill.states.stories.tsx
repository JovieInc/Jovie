import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LinkPill } from './LinkPill';

const meta = {
  title: 'Dashboard/Atoms/LinkPill/States',
  component: LinkPill,
  parameters: { layout: 'centered' },
  args: {
    platformIcon: 'spotify',
    platformName: 'Spotify',
    primaryText: 'Spotify',
    secondaryText: 'artist.spotify.com/12345',
    state: 'connected',
    menuId: 'states',
    isMenuOpen: false,
    onMenuOpenChange: () => undefined,
    menuItems: [
      { id: 'edit', label: 'Edit', iconName: 'Pencil', onSelect: () => {} },
      {
        id: 'remove',
        label: 'Remove',
        iconName: 'Trash',
        variant: 'destructive',
        onSelect: () => {},
      },
    ],
  },
  decorators: [
    function PillFrame(Story) {
      return (
        <div className='w-80'>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof LinkPill>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the link is still being verified. */
export const LoadingLink: Story = {
  args: { state: 'loading', secondaryText: 'Checking link…' },
};

/** Empty: a pill whose menu has no actions. */
export const EmptyMenu: Story = {
  args: { menuItems: [] },
};

/** Partial: no secondary text or badge is available yet. */
export const PartialNoSecondaryText: Story = {
  args: { state: 'ready', secondaryText: undefined },
};

/** Long content: long primary and secondary text truncate. */
export const LongContentText: Story = {
  args: {
    primaryText: 'A platform profile name that is far too long for the pill',
    secondaryText:
      'https://example.com/a/very/long/path/that/keeps/going/and/going/forever',
    badgeText: 'Needs attention',
  },
};

/** Rtl: the pill in a right-to-left list. */
export const RtlLink: Story = {
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl' className='w-80'>
          <Story />
        </div>
      );
    },
  ],
};
