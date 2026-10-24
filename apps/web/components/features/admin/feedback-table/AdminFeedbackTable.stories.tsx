import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { APP_ROUTES } from '@/constants/routes';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import { AdminPeopleRightPanelProvider } from '../AdminPeopleRightPanelProvider';
import { AdminFeedbackTable } from './AdminFeedbackTable';

const items = [
  {
    id: 'fb_1',
    message: 'The release table pagination jumps when I open the drawer.',
    source: 'in_app',
    status: 'pending' as const,
    classification: 'bug_verifiable' as const,
    disposition: 'auto_remediation' as const,
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
  {
    id: 'fb_2',
    message: 'Let me choose a compact layout for the release table.',
    source: 'chat',
    status: 'pending' as const,
    classification: 'feature_or_change' as const,
    disposition: 'cert_required' as const,
    createdAtIso: '2026-09-10T15:00:00.000Z',
    dismissedAtIso: null,
    user: {
      id: 'user_2',
      name: 'Mira Stone',
      email: 'mira@example.com',
      clerkId: 'clerk_2',
    },
    context: { pathname: APP_ROUTES.DASHBOARD_RELEASES },
  },
  {
    id: 'fb_3',
    message: 'Testing the feedback form.',
    source: 'dashboard',
    status: 'dismissed' as const,
    classification: 'noise' as const,
    disposition: 'never' as const,
    createdAtIso: '2026-09-10T16:00:00.000Z',
    dismissedAtIso: '2026-09-10T16:01:00.000Z',
    user: {
      id: null,
      name: null,
      email: null,
      clerkId: null,
    },
    context: {},
  },
];

const unclassifiedItems = [
  {
    ...items[0],
    id: 'fb_unclassified',
    classification: null,
    disposition: 'pending' as const,
  },
];

const meta: Meta<typeof AdminFeedbackTable> = {
  title: 'Admin/Tables/Feedback',
  component: AdminFeedbackTable,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <RightPanelProvider>
        <AdminPeopleRightPanelProvider>
          <Story />
        </AdminPeopleRightPanelProvider>
      </RightPanelProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { items },
};

export const Unclassified: Story = {
  args: { items: unclassifiedItems },
};

export const Empty: Story = {
  args: { items: [] },
};

export const LoadError: Story = {
  args: { items: [], loadError: 'Failed to load feedback' },
};
