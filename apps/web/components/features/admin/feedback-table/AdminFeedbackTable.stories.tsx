import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { APP_ROUTES } from '@/constants/routes';
import { AdminFeedbackTable } from './AdminFeedbackTable';

const items = [
  {
    id: 'fb_1',
    message: 'The release table pagination jumps when I open the drawer.',
    source: 'in_app',
    status: 'pending' as const,
    createdAtIso: '2026-09-10T14:00:00.000Z',
    dismissedAtIso: null,
    user: {
      id: 'user_1',
      name: 'Ari Lane',
      email: 'ari@example.com',
      clerkId: 'clerk_1',
    },
    context: { pathname: APP_ROUTES.DASHBOARD_RELEASES },
  },
];

const meta: Meta<typeof AdminFeedbackTable> = {
  title: 'Admin/Tables/Feedback',
  component: AdminFeedbackTable,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { items },
};

export const Empty: Story = {
  args: { items: [] },
};

export const LoadError: Story = {
  args: { items: [], loadError: 'Failed to load feedback' },
};
