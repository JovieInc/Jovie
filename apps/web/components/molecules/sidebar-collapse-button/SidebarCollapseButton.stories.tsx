import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SidebarProvider } from '@/components/organisms/Sidebar';
import { SidebarCollapseButton } from '.';

const meta: Meta<typeof SidebarCollapseButton> = {
  title: 'Molecules/SidebarCollapseButton',
  component: SidebarCollapseButton,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Borderless circular System B icon control for expanding/collapsing the app sidebar. No border in any state; hover uses a soft surface fill.',
      },
    },
  },
  decorators: [
    Story => (
      <SidebarProvider>
        <div className='flex items-center gap-4 bg-surface-1 p-6'>
          <Story />
          <span className='text-xs text-secondary-token'>
            Hover for circular highlight · no border
          </span>
        </div>
      </SidebarProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const OnContentSurface: Story = {
  decorators: [
    Story => (
      <SidebarProvider>
        <div className='flex items-center gap-3 bg-(--linear-app-content-surface) p-4'>
          <Story />
        </div>
      </SidebarProvider>
    ),
  ],
};
