import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import { AdminPeopleRightPanelProvider } from './AdminPeopleRightPanelProvider';

const meta = {
  title: 'Features/Admin/AdminPeopleRightPanelProvider',
  component: AdminPeopleRightPanelProvider,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Shares one right-panel owner across the Admin People tabs. Requires a RightPanelProvider ancestor (supplied by AuthShell in production; wired here as a decorator).',
      },
    },
  },
  decorators: [
    Story => (
      <RightPanelProvider>
        <Story />
      </RightPanelProvider>
    ),
  ],
} satisfies Meta<typeof AdminPeopleRightPanelProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <div className='rounded-lg border border-subtle p-4 text-sm text-primary-token'>
        Admin People tab content
      </div>
    ),
  },
};
