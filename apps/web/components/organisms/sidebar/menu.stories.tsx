import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Inbox } from 'lucide-react';
import { SidebarProvider } from './context';
import {
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from './menu';

const meta = {
  title: 'Organisms/Sidebar/menu',
  component: SidebarMenuButton,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <SidebarProvider>
        <div className='w-56 p-4'>
          <SidebarMenu>
            <SidebarMenuItem>
              <Story />
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarProvider>
    ),
  ],
} satisfies Meta<typeof SidebarMenuButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Overview',
  },
};

export const Active: Story = {
  args: {
    children: 'Library',
    isActive: true,
  },
};

export const Disabled: Story = {
  args: {
    children: 'Earnings',
    disabled: true,
  },
};

/** Rows still resolving render the menu skeleton in place of buttons. */
export const LoadingRows: Story = {
  render: () => (
    <>
      <SidebarMenuSkeleton showIcon />
      <SidebarMenuSkeleton showIcon />
      <SidebarMenuSkeleton />
    </>
  ),
};

/** A row with an icon and count badge but no tooltip or row actions. */
export const PartialIconAndBadge: Story = {
  render: () => (
    <>
      <SidebarMenuButton>
        <Inbox aria-hidden='true' />
        <span>Inbox</span>
      </SidebarMenuButton>
      <SidebarMenuBadge>12</SidebarMenuBadge>
    </>
  ),
};

/** A long label truncates inside the rail instead of widening it. */
export const LongContentLabel: Story = {
  args: {
    children: (
      <>
        <Inbox aria-hidden='true' />
        <span>
          Release Planning for The Extraordinarily Long Album Title (Deluxe
          Anniversary Remastered Edition)
        </span>
      </>
    ),
  },
};

export const RtlLabel: Story = {
  args: {
    children: (
      <>
        <Inbox aria-hidden='true' />
        <span>صندوق الوارد</span>
      </>
    ),
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
