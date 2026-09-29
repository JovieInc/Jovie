import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SidebarProvider } from './context';
import {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInput,
  SidebarSeparator,
} from './layout';

const meta = {
  title: 'Organisms/Sidebar/layout',
  component: SidebarHeader,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <SidebarProvider>
        <div className='flex h-96 w-64 flex-col bg-surface-0'>
          <Story />
        </div>
      </SidebarProvider>
    ),
  ],
} satisfies Meta<typeof SidebarHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <>
      <SidebarHeader>
        <SidebarInput placeholder='Search...' />
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <p className='px-2.5 py-2 text-sm text-secondary-token'>
          Sidebar content
        </p>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter>
        <p className='text-2xs text-tertiary-token'>Footer</p>
      </SidebarFooter>
    </>
  ),
};
