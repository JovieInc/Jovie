import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import { AdminReleasesPageWrapper } from './AdminReleasesPageWrapper';

const meta = {
  title: 'Features/Admin/AdminReleasesPageWrapper',
  component: AdminReleasesPageWrapper,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Requires a HeaderActionsProvider ancestor (supplied by the admin shell in production; wired here as a decorator) so it can register the drawer-toggle header action.',
      },
    },
  },
  decorators: [
    Story => (
      <HeaderActionsProvider>
        <Story />
      </HeaderActionsProvider>
    ),
  ],
  args: {
    releases: [],
    pageSize: 25,
    total: 0,
    search: '',
    sort: 'release_date_desc',
  },
} satisfies Meta<typeof AdminReleasesPageWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
