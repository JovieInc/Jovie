import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SidebarProvider } from './context';
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
} from './group';

const meta = {
  title: 'Organisms/Sidebar/group',
  component: SidebarGroup,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <SidebarProvider>
        <div className='w-64 bg-surface-0 p-2'>
          <Story />
        </div>
      </SidebarProvider>
    ),
  ],
} satisfies Meta<typeof SidebarGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <SidebarGroup>
      <SidebarGroupLabel>Library</SidebarGroupLabel>
      <SidebarGroupContent>
        <p className='px-2.5 text-sm text-secondary-token'>Group content</p>
      </SidebarGroupContent>
    </SidebarGroup>
  ),
};

export const WithAction: Story = {
  render: () => (
    <SidebarGroup>
      <SidebarGroupLabel>Playlists</SidebarGroupLabel>
      <SidebarGroupAction aria-label='Add playlist'>+</SidebarGroupAction>
      <SidebarGroupContent>
        <p className='px-2.5 text-sm text-secondary-token'>Group content</p>
      </SidebarGroupContent>
    </SidebarGroup>
  ),
};
