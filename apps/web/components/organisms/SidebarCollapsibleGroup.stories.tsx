import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Music } from 'lucide-react';
import { SidebarProvider } from '@/components/organisms/sidebar';
import { SidebarCollapsibleGroup } from './SidebarCollapsibleGroup';

const meta = {
  title: 'Organisms/SidebarCollapsibleGroup',
  component: SidebarCollapsibleGroup,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <SidebarProvider>
        <div className='w-56 p-4'>
          <Story />
        </div>
      </SidebarProvider>
    ),
  ],
  args: {
    label: 'Section',
    children: <div className='px-2.5 py-2 text-xs'>Group content</div>,
  },
} satisfies Meta<typeof SidebarCollapsibleGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Collapsed: Story = {
  args: { defaultOpen: false },
};

export const WithIcon: Story = {
  args: { icon: Music },
};
