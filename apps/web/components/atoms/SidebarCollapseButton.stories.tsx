import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SidebarProvider } from '@/components/organisms/Sidebar';
import { SidebarCollapseButton } from './SidebarCollapseButton';

const meta: Meta<typeof SidebarCollapseButton> = {
  title: 'Atoms/SidebarCollapseButton',
  component: SidebarCollapseButton,
  tags: ['autodocs'],
  decorators: [
    Story => (
      <SidebarProvider>
        <div className='p-6'>
          <Story />
        </div>
      </SidebarProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
