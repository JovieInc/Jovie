import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DashboardHeader } from './DashboardHeader';

const meta = {
  title: 'Dashboard/Organisms/DashboardHeader',
  component: DashboardHeader,
  parameters: { layout: 'fullscreen' },
  args: {
    breadcrumbs: [{ label: 'New Chat', href: '/app/chat' }],
  },
  decorators: [
    Story => (
      <div className='bg-base'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DashboardHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NewChat: Story = {};

export const TransparentChat: Story = {
  args: {
    breadcrumbs: [{ label: 'New Chat', href: '/app/chat' }],
    transparent: true,
    searchSurface: (
      <button type='button' className='text-xs text-secondary-token'>
        Search chats
      </button>
    ),
  },
};
