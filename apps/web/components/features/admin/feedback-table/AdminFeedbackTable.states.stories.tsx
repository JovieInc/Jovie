import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import { AdminPeopleRightPanelProvider } from '../AdminPeopleRightPanelProvider';
import { AdminFeedbackTable } from './AdminFeedbackTable';

type Items = React.ComponentProps<typeof AdminFeedbackTable>['items'];

const baseItem: Items[number] = {
  id: 'fb_state',
  message: 'The release table pagination jumps when I open the drawer.',
  source: 'in_app',
  status: 'pending',
  classification: 'bug_verifiable',
  disposition: 'auto_remediation',
  createdAtIso: '2026-09-10T14:00:00.000Z',
  dismissedAtIso: null,
  user: {
    id: 'user_1',
    name: 'Ari Lane',
    email: 'ari@example.com',
    clerkId: 'clerk_1',
  },
  context: { pathname: '/app/releases' },
};

function WithAdminPanel({ children }: { readonly children: React.ReactNode }) {
  return (
    <RightPanelProvider>
      <AdminPeopleRightPanelProvider>{children}</AdminPeopleRightPanelProvider>
    </RightPanelProvider>
  );
}

const meta: Meta<typeof AdminFeedbackTable> = {
  title: 'Admin/Tables/Feedback/States',
  component: AdminFeedbackTable,
  parameters: { layout: 'fullscreen' },
  decorators: [
    function WithPanel(Story) {
      return (
        <WithAdminPanel>
          <Story />
        </WithAdminPanel>
      );
    },
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: the feedback query failed, so zero rows must not read as no feedback. */
export const ErrorLoadFailed: Story = {
  args: { items: [], loadError: 'Failed to load feedback' },
};

/** Offline: the same unavailable face when the admin has lost connectivity. */
export const Offline: Story = {
  args: { items: [], loadError: 'You are offline' },
};

/** Partial: unclassified feedback from a visitor with no name or email. */
export const Partial: Story = {
  args: {
    items: [
      {
        ...baseItem,
        classification: null,
        disposition: 'pending',
        user: { id: null, name: null, email: null, clerkId: null },
        context: {},
      },
    ],
  },
};

/** Long content: a multi-sentence message and a very long user name. */
export const LongContent: Story = {
  args: {
    items: [
      {
        ...baseItem,
        message:
          'When I open the release drawer from the table the pagination controls jump two rows down, and then the focus ring disappears until I press Tab again. This happens on every release I open, in both the compact and the comfortable layouts, and it is much worse on a narrow window.',
        user: {
          id: 'user_2',
          name: 'Alexandria Montgomery-Featherstonehaugh de la Cruz',
          email: 'alexandria.montgomery.featherstonehaugh@example.com',
          clerkId: 'clerk_2',
        },
      },
    ],
  },
};

/** Rtl: Arabic feedback from an Arabic-speaking user in a right-to-left page. */
export const Rtl: Story = {
  args: {
    items: [
      {
        ...baseItem,
        message: 'ينتقل ترقيم صفحات جدول الإصدارات عند فتح الدرج.',
        user: {
          id: 'user_3',
          name: 'ليلى الحسن',
          email: 'layla@example.com',
          clerkId: 'clerk_3',
        },
      },
    ],
  },
  decorators: [
    function WithRtl(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
