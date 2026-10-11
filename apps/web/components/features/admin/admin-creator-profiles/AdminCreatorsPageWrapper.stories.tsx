import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import { AdminCreatorsPageWrapper } from './AdminCreatorsPageWrapper';

const meta = {
  title: 'Features/Admin/AdminCreatorsPageWrapper',
  component: AdminCreatorsPageWrapper,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Requires a HeaderActionsProvider ancestor (supplied by the admin shell in production; wired here as a decorator) so it can register the batch-ingest and drawer-toggle header actions.',
      },
    },
  },
  decorators: [
    Story => (
      <RightPanelProvider>
        <HeaderActionsProvider>
          <Story />
        </HeaderActionsProvider>
      </RightPanelProvider>
    ),
  ],
  args: {
    profiles: [],
    page: 1,
    pageSize: 25,
    total: 0,
    search: '',
    sort: 'created_desc',
  },
} satisfies Meta<typeof AdminCreatorsPageWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
