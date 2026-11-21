import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FlaskConical, Music } from 'lucide-react';
import { SidebarProvider } from '@/components/organisms/sidebar';
import { CustomerNavMoreMenu } from './CustomerNavMoreMenu';
import type { NavItem } from './types';

const overflowItems: NavItem[] = [
  {
    id: 'labs',
    name: 'Labs',
    href: '/app/labs',
    icon: FlaskConical,
    tier: 'experimental',
  },
  {
    id: 'signals',
    name: 'Signals',
    href: '/app/signals',
    icon: Music,
    tier: 'experimental',
  },
];

const meta = {
  title: 'Dashboard/Nav/CustomerNavMoreMenu/States',
  component: CustomerNavMoreMenu,
  parameters: { layout: 'centered' },
  args: {
    items: overflowItems,
    isItemActive: (_item: NavItem): boolean => false,
  },
  decorators: [
    function NavFrame(Story) {
      return (
        <SidebarProvider>
          <ul className='w-56'>
            <Story />
          </ul>
        </SidebarProvider>
      );
    },
  ],
} satisfies Meta<typeof CustomerNavMoreMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: one overflow destination is active, so the trigger shows the dot. */
export const PartialActiveOverflow: Story = {
  args: { isItemActive: item => item.id === 'signals' },
};

/** Long content: a destination name longer than the menu width. */
export const LongContentItemName: Story = {
  args: {
    items: [
      {
        ...overflowItems[0],
        name: 'An overflow destination with an exceptionally long name',
      },
    ],
  },
};

/** Rtl: the trigger inside a right-to-left sidebar. */
export const RtlTrigger: Story = {
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
