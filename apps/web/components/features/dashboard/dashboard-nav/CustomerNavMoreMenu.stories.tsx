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
  title: 'Dashboard/Nav/CustomerNavMoreMenu',
  component: CustomerNavMoreMenu,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['item', 'inputMethod'] },
  },
  decorators: [
    Story => (
      <SidebarProvider>
        <ul className='w-56'>
          <Story />
        </ul>
      </SidebarProvider>
    ),
  ],
  args: {
    items: overflowItems,
    isItemActive: () => false,
  },
} satisfies Meta<typeof CustomerNavMoreMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: { items: [] },
};
