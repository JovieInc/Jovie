import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Music } from 'lucide-react';
import { NavMenuItem } from './NavMenuItem';

type NavMenuItemMeta = Meta<typeof NavMenuItem>;

/** NavMenuItem renders an li, so each story gets a real list parent (axe listitem). */
const SidebarListDecorator: NonNullable<NavMenuItemMeta['decorators']> =
  function SidebarListDecorator(Story, context) {
    const rtl = context.parameters.rtl === true;
    return (
      <ul
        dir={rtl ? 'rtl' : undefined}
        lang={rtl ? 'ar' : undefined}
        className='m-0 w-60 list-none bg-sidebar p-3'
      >
        <Story />
      </ul>
    );
  };

/**
 * Rendered states of the sidebar navigation row. The default rows live in
 * NavMenuItem.stories.tsx.
 */
const meta = {
  title: 'Dashboard/Navigation/Item/States',
  component: NavMenuItem,
  parameters: { layout: 'centered' },
  decorators: [SidebarListDecorator],
  args: {
    item: { id: 'library', name: 'Library', href: '/app/library', icon: Music },
    isActive: false,
  },
} satisfies NavMenuItemMeta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the destination route is resolving, painted as the pending row. */
export const LoadingPendingDestination: Story = {
  args: { pending: true },
};

/** Partial: a row with no badge, shortcut or trailing actions. */
export const PartialNoBadgeOrActions: Story = {
  args: {
    item: {
      id: 'releases',
      name: 'Releases',
      href: '/app/releases',
      icon: Music,
    },
  },
};

/** Long content: a destination name far past the rail width, with a badge. */
export const LongContentFadedLabel: Story = {
  args: {
    item: {
      id: 'library',
      name: 'A deliberately long destination name that fades at the rail edge',
      href: '/app/library',
      icon: Music,
      badge: <span className='text-2xs text-tertiary-token'>128</span>,
    },
  },
};

/** Right-to-left: an Arabic destination name in an RTL document. */
export const RtlArabicLabel: Story = {
  args: {
    item: {
      id: 'library',
      name: 'المكتبة الموسيقية',
      href: '/app/library',
      icon: Music,
    },
  },
  parameters: { rtl: true },
};
