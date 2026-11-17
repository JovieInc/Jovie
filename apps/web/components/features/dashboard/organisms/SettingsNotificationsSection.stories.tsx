import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ComponentType } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import {
  DASHBOARD_FIXTURE_PROFILE,
  DashboardStoryProviders,
  DEFAULT_DASHBOARD_DATA,
} from '@/.storybook/dashboard-fixtures';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { SettingsNotificationsSection } from './SettingsNotificationsSection';

type SaveMode = 'ok' | 'fail' | 'hang';

const profile = {
  ...DASHBOARD_FIXTURE_PROFILE,
  settings: { require_double_opt_in: true },
} as DashboardData['selectedProfile'];

const dashboardData: DashboardData = {
  ...DEFAULT_DASHBOARD_DATA,
  creatorProfiles: [profile] as DashboardData['creatorProfiles'],
  selectedProfile: profile,
};

function withDashboard(Story: ComponentType) {
  return (
    <DashboardStoryProviders dashboardData={dashboardData}>
      <div className='max-w-2xl'>
        <Story />
      </div>
    </DashboardStoryProviders>
  );
}

function withRtl(Story: ComponentType) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

const meta = {
  title: 'Dashboard/Organisms/SettingsNotificationsSection',
  component: SettingsNotificationsSection,
  parameters: { layout: 'padded' },
  // Answers the profile settings PUT so no story reaches the network.
  beforeEach: ({ parameters }) => {
    const mockWindow = window as Window & {
      __jovieApiMock?: (request: {
        url: URL;
        init?: RequestInit;
      }) => Response | Promise<Response> | undefined;
    };
    const previous = mockWindow.__jovieApiMock;
    const mode = (parameters.saveMode as SaveMode | undefined) ?? 'ok';
    mockWindow.__jovieApiMock = request => {
      if (
        request.url.pathname !== '/api/dashboard/profile' ||
        request.init?.method !== 'PUT'
      ) {
        return previous?.(request);
      }
      if (mode === 'hang') return new Promise<Response>(() => {});
      return mode === 'fail'
        ? Response.json({ error: 'Unavailable' }, { status: 503 })
        : Response.json({ success: true });
    };
    return () => {
      mockWindow.__jovieApiMock = previous;
    };
  },
  decorators: [withDashboard],
  args: { isGrowth: true },
} satisfies Meta<typeof SettingsNotificationsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Growth: Story = {};

/** Loading: the switch is disabled while the save is in flight. */
export const LoadingSave: Story = {
  parameters: { saveMode: 'hang' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const control = canvas.getByRole('switch', {
      name: 'Double Opt-in Verification',
    });
    await userEvent.click(control);
    await waitFor(() => expect(control).toBeDisabled());
  },
};

/** Error: the save fails and the switch returns to its saved value. */
export const ErrorSaveFailed: Story = {
  parameters: { saveMode: 'fail' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const control = canvas.getByRole('switch', {
      name: 'Double Opt-in Verification',
    });
    await userEvent.click(control);
    await waitFor(() => expect(control).toBeChecked());
  },
};

/** Permission denied: below Growth the switch is replaced by the Max gate. */
export const PermissionDeniedBelowGrowth: Story = {
  args: { isGrowth: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('switch')).toBeNull();
    await expect(
      canvas.getByRole('link', { name: 'Upgrade to Max' })
    ).toBeVisible();
  },
};

/** Right-to-left: the verification panel inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [withRtl],
};
