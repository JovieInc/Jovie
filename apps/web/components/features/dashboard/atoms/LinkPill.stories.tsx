import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { LinkPill, type LinkPillMenuItem } from './LinkPill';

const MENU_ITEMS: LinkPillMenuItem[] = [
  { id: 'edit', label: 'Edit link', iconName: 'Pencil', onSelect: () => {} },
  { id: 'copy', label: 'Copy link', iconName: 'Copy', onSelect: () => {} },
  {
    id: 'remove',
    label: 'Remove',
    iconName: 'Trash2',
    variant: 'destructive',
    onSelect: () => {},
  },
];

function ControlledLinkPill(
  props: Omit<Parameters<typeof LinkPill>[0], 'isMenuOpen' | 'onMenuOpenChange'>
) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  return (
    <LinkPill
      {...props}
      isMenuOpen={isMenuOpen}
      onMenuOpenChange={setIsMenuOpen}
    />
  );
}

const meta = {
  title: 'Dashboard/Atoms/LinkPill',
  component: LinkPill,
  parameters: {
    layout: 'centered',
  },
  args: {
    platformIcon: 'spotify',
    platformName: 'Spotify',
    primaryText: 'Spotify',
    secondaryText: 'artist.spotify.com/12345',
    state: 'connected',
    menuItems: MENU_ITEMS,
    menuId: 'link-pill-story',
  },
  render: args => <ControlledLinkPill {...args} />,
} satisfies Meta<typeof LinkPill>;

export default meta;
type Story = StoryObj<typeof ControlledLinkPill>;

export const Connected: Story = {
  args: {
    platformIcon: 'spotify',
    platformName: 'Spotify',
    primaryText: 'Spotify',
    secondaryText: 'artist.spotify.com/12345',
    state: 'connected',
    menuItems: MENU_ITEMS,
    menuId: 'link-pill-story',
  },
};

export const ErrorState: Story = {
  args: {
    platformIcon: 'spotify',
    platformName: 'Spotify',
    primaryText: 'Spotify',
    state: 'error',
    secondaryText: 'Link is broken',
    menuItems: MENU_ITEMS,
    menuId: 'link-pill-story',
  },
};

export const NoMenuItems: Story = {
  args: {
    platformIcon: 'spotify',
    platformName: 'Spotify',
    primaryText: 'Spotify',
    secondaryText: 'artist.spotify.com/12345',
    state: 'connected',
    menuItems: [],
    menuId: 'link-pill-story',
  },
};
