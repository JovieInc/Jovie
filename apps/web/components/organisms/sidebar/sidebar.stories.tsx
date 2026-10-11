import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SidebarProvider } from './context';
import { Sidebar } from './sidebar';

const meta = {
  title: 'Organisms/Sidebar/sidebar',
  component: Sidebar,
  parameters: {
    layout: 'centered',
  },
  // Sidebar reads useSidebar(); the app always mounts it under a provider.
  decorators: [
    Story => (
      <SidebarProvider>
        <Story />
      </SidebarProvider>
    ),
  ],
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
