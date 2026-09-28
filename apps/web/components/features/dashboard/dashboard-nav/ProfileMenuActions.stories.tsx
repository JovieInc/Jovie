import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SidebarProvider } from '@/components/organisms/sidebar';
import { ProfileMenuActions } from './ProfileMenuActions';

const meta = {
  title: 'Dashboard/Nav/ProfileMenuActions',
  component: ProfileMenuActions,
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
    publicProfileHref: '/artist',
  },
} satisfies Meta<typeof ProfileMenuActions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
