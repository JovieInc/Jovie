import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Music, SquarePen } from 'lucide-react';
import { NavMenuItem } from './NavMenuItem';

const meta: Meta<typeof NavMenuItem> = {
  title: 'Dashboard/Navigation/Item',
  component: NavMenuItem,
  parameters: {
    layout: 'centered',
    jovie: {
      // The ship-gate required-props heuristic unions every *Props* block in
      // the component file, including the internal
      // NavMenuInteractiveElementProps wiring that NavMenuItem never exposes.
      // None of these are part of the nav-row story contract.
      uncoveredProps: [
        'preventNavigation',
        'renderAsButton',
        'onButtonClick',
        'onLinkClick',
        'onPressStart',
      ],
    },
  },
  decorators: [
    Story => (
      // NavMenuItem renders an li; give the story a real list parent
      // (axe listitem).
      <ul className='m-0 w-60 list-none bg-sidebar p-3'>
        <Story />
      </ul>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof NavMenuItem>;

export const Default: Story = {
  args: {
    item: { id: 'library', name: 'Library', href: '/app/library', icon: Music },
    isActive: false,
  },
};

export const Active: Story = {
  args: {
    item: {
      id: 'library',
      name: 'Library',
      href: '/app/library',
      icon: Music,
    },
    isActive: true,
  },
};

// Elevated New Chat create row (JOV-6181): the primary tone drops the
// terminal label fade so the full label renders on the compact w-fit pill.
export const PrimaryCreate: Story = {
  args: {
    item: {
      id: 'chat',
      name: 'New Chat',
      href: '/app/chat',
      icon: SquarePen,
      tone: 'primary',
    },
    isActive: false,
  },
};
