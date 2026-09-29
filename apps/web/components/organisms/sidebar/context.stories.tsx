import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SidebarProvider, useSidebar } from './context';

function SidebarStateReadout() {
  const { state, isMobile, toggleSidebar } = useSidebar();
  return (
    <div className='space-y-2 p-4 text-sm text-primary-token'>
      <p>
        state: <span className='font-caption'>{state}</span>
      </p>
      <p>
        isMobile: <span className='font-caption'>{String(isMobile)}</span>
      </p>
      <Button type='button' variant='outline' size='sm' onClick={toggleSidebar}>
        Toggle sidebar
      </Button>
    </div>
  );
}

const meta = {
  title: 'Organisms/Sidebar/context',
  component: SidebarProvider,
  parameters: {
    layout: 'centered',
  },
  args: {
    children: <SidebarStateReadout />,
  },
} satisfies Meta<typeof SidebarProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const DefaultClosed: Story = {
  args: {
    defaultOpen: false,
  },
};
