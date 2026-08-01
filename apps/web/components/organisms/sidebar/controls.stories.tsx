import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SidebarProvider } from './context';
import { SidebarShortcutHint, SidebarTrigger } from './controls';

const meta = {
  title: 'Organisms/Sidebar/controls',
  component: SidebarTrigger,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <SidebarProvider>
        <div className='flex items-center gap-2 p-4'>
          <Story />
          <SidebarShortcutHint />
        </div>
      </SidebarProvider>
    ),
  ],
} satisfies Meta<typeof SidebarTrigger>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Trigger: Story = {};
