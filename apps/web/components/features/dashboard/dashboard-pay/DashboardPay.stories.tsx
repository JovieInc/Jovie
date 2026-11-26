import type { Meta, StoryObj } from '@storybook/nextjs-vite';
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

type DashboardProfile = NonNullable<DashboardData['selectedProfile']>;

function connectedData(venmoHandle: string): DashboardData {
  return {
    ...DEFAULT_DASHBOARD_DATA,
    selectedProfile: {
      ...DASHBOARD_FIXTURE_PROFILE,
      venmoHandle,
    } as DashboardProfile,
    tippingStats: {
      ...DEFAULT_DASHBOARD_DATA.tippingStats,
      tipClicks: 1_284_300,
      qrTipClicks: 402_100,
      linkTipClicks: 882_200,
    },
  };
}

/** Empty: Venmo is not connected, so earnings are locked behind the connect card. */
export const EmptyVenmoNotConnected: Story = {};

/** Long content: a long Venmo handle truncates and the metric counts are large. */
export const LongContentConnected: Story = {
  decorators: [
    function ConnectedDecorator(Story) {
      return (
        <DashboardStoryProviders
          dashboardData={connectedData(
            '@a-very-long-venmo-username-for-layout'
          )}
        >
          <Story />
        </DashboardStoryProviders>
      );
    },
  ],
};

/** RTL: the connected dashboard mirrors in a right-to-left document. */
export const RtlConnected: Story = {
  decorators: [
    function RtlConnectedDecorator(Story) {
      return (
        <div dir='rtl'>
          <DashboardStoryProviders dashboardData={connectedData('@artist')}>
            <Story />
          </DashboardStoryProviders>
        </div>
      );
    },
  ],
};
