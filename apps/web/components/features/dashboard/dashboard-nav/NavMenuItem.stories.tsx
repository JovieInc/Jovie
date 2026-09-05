import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  Sidebar,
  SidebarMenu,
  SidebarProvider,
} from '../../../organisms/sidebar';
import { chatNavItem } from './config';
import { NavMenuItem } from './NavMenuItem';

const meta = {
  title: 'Features/Dashboard/NavMenuItem',
  component: NavMenuItem,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <SidebarProvider defaultOpen style={{ height: '100vh' }}>
        <Sidebar collapsible='offcanvas'>
          <SidebarMenu>
            <Story />
          </SidebarMenu>
        </Sidebar>
      </SidebarProvider>
    ),
  ],
  args: { item: chatNavItem, isActive: true },
} satisfies Meta<typeof NavMenuItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {};

export const LongLabel: Story = {
  args: {
    item: {
      ...chatNavItem,
      id: 'long',
      name: 'A deliberately long navigation title that exceeds the sidebar',
    },
    isActive: false,
  },
};
