import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  DASHBOARD_FIXTURE_PROFILE,
  DashboardStoryProviders,
  DEFAULT_DASHBOARD_DATA,
  withDashboardProviders,
} from '@/.storybook/dashboard-fixtures';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardPay } from './DashboardPay';

const meta = {
  title: 'Features/Dashboard/DashboardPay/DashboardPay',
  component: DashboardPay,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: [
        'label',
        'value',
        'description',
        'icon',
        'venmoHandle',
        'onEdit',
        'onDisconnect',
        'onVenmoHandleChange',
        'onSave',
        'onCancel',
        'isSaving',
        'open',
        'onClose',
        'saveSuccess',
        'tipUrl',
        'tipRelativePathLink',
      ],
    },
  },
  decorators: [withDashboardProviders],
} satisfies Meta<typeof DashboardPay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

function dataWithVenmo(handle: string): DashboardData {
  const profile = DASHBOARD_FIXTURE_PROFILE;
  if (!profile) return DEFAULT_DASHBOARD_DATA;
  return {
    ...DEFAULT_DASHBOARD_DATA,
    selectedProfile: { ...profile, venmoHandle: handle },
  };
}

function withVenmoHandle(handle: string): Decorator {
  return function VenmoHandleDecorator(Story) {
    return (
      <DashboardStoryProviders dashboardData={dataWithVenmo(handle)}>
        <Story />
      </DashboardStoryProviders>
    );
  };
}

/** Empty: no Venmo connected yet, so earnings are locked. */
export const EmptyVenmoNotConnected: Story = {};

export const LongContentVenmoHandle: Story = {
  decorators: [
    withVenmoHandle(
      'the-extraordinarily-long-venmo-handle-of-a-midnight-orchestra'
    ),
  ],
};

export const RtlVenmoHandle: Story = {
  decorators: [withVenmoHandle('فرقة-منتصف-الليل')],
};
