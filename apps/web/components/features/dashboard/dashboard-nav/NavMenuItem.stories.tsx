import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Music, SquarePen } from 'lucide-react';
import { expect, within } from 'storybook/test';
import { SidebarMenu } from '@/components/organisms/sidebar';
import { APP_ROUTES } from '@/constants/routes';
import { homeNavItem } from './config';
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
      <div className='w-60 bg-sidebar p-3'>
        <SidebarMenu>
          <Story />
        </SidebarMenu>
      </div>
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

// Compact create controls use the same crisp label treatment as destinations.
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

export const LongLabelWithBadge: Story = {
  args: {
    calm: true,
    item: {
      id: 'library',
      name: 'A long destination with a separate count',
      href: APP_ROUTES.LIBRARY,
      icon: Music,
      badge: '12',
    },
    isActive: false,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const label = canvas.getByText(args.item.name);
    const badge = canvas.getByText('12');
    const link = canvas.getByRole('link');
    await expect(link).toHaveAccessibleName(`${args.item.name} 12`);
    await expect(label.scrollWidth).toBeGreaterThan(label.clientWidth);
    await expect(label.getBoundingClientRect().right).toBeLessThanOrEqual(
      badge.getBoundingClientRect().left
    );
    await expect(globalThis.getComputedStyle(label).maskImage).toBe('none');
    await expect(globalThis.getComputedStyle(label).textOverflow).toBe(
      'ellipsis'
    );
  },
};

export const InboxDestination: Story = {
  args: {
    calm: true,
    item: homeNavItem,
    isActive: true,
  },
};
