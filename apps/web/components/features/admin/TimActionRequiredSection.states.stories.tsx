import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import type {
  TimActionIssue,
  TimActionsResponse,
} from '@/lib/hud/linear-actions';
import { TimActionRequiredSection } from './TimActionRequiredSection';

type ApiMockWindow = Window & {
  __jovieApiMock?: (request: {
    url: URL;
    init?: RequestInit;
  }) => Response | Promise<Response> | undefined;
};

/** Answers the Linear actions route the way a story asks; returns a restore. */
function stubTimActions(respond: () => Promise<Response>) {
  const apiMockWindow = window as ApiMockWindow;
  const previous = apiMockWindow.__jovieApiMock;
  apiMockWindow.__jovieApiMock = request =>
    request.url.pathname === '/api/admin/hud/tim-actions'
      ? respond()
      : previous?.(request);
  return () => {
    apiMockWindow.__jovieApiMock = previous;
  };
}

const issue = (
  index: number,
  title: string,
  overrides: Partial<TimActionIssue> = {}
): TimActionIssue => ({
  id: `issue-${index}`,
  identifier: `JOV-${6100 + index}`,
  title,
  url: `https://linear.app/jovie/issue/JOV-${6100 + index}`,
  priority: (index % 4) + 1,
  priorityLabel: 'Urgent',
  createdAt: '2026-09-19T00:00:00.000Z',
  daysOld: 3 + index * 2,
  stateType: 'started',
  ...overrides,
});

const response = (
  overrides: Partial<TimActionsResponse> = {}
): TimActionsResponse => ({
  issues: [
    issue(1, 'Approve payout batch for September creators'),
    issue(2, 'Review revised creator onboarding copy'),
  ],
  fetchedAt: '2026-09-28T00:00:00.000Z',
  available: true,
  observation: 'ok',
  errorMessage: null,
  ...overrides,
});

/** State coverage for the founder decisions list; Default, Empty, Locked and Loading live in TimActionRequiredSection.stories.tsx. */
const meta = {
  title: 'Admin/Hud/TimActionRequiredSection States',
  component: TimActionRequiredSection,
  parameters: { layout: 'padded' },
  decorators: [
    Story => (
      <div className='max-w-2xl'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TimActionRequiredSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: Linear answered 500, so the list offers a retry instead of rows. */
export const ErrorLinearUnavailable: Story = {
  beforeEach: () =>
    stubTimActions(async () =>
      Response.json({ error: 'unavailable' }, { status: 500 })
    ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Linear actions are unavailable.')
    ).toBeVisible();
  },
};

/** Partial: Linear is degraded, so the last known decisions show with a notice. */
export const PartialLastKnownDecisions: Story = {
  beforeEach: () =>
    stubTimActions(async () =>
      Response.json(response({ observation: 'unavailable', available: false }))
    ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(
        'Showing last known decisions. Retry to refresh.'
      )
    ).toBeVisible();
  },
};

/** Long content: many overdue decisions with long titles truncate per row. */
export const LongContentManyDecisions: Story = {
  beforeEach: () =>
    stubTimActions(async () =>
      Response.json(
        response({
          issues: Array.from({ length: 8 }, (_, i) =>
            issue(
              i + 1,
              `Approve the revised payout, distribution and royalty split for every September creator in batch ${i + 1}`,
              { daysOld: 40 + i }
            )
          ),
        })
      )
    ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findAllByRole('button', {
        name: /^Mark ".*" as done$/,
      })
    ).toHaveLength(8);
  },
};

/** Offline: the read never reached the server. */
export const OfflineNetworkFailure: Story = {
  beforeEach: () =>
    stubTimActions(() => Promise.reject(new TypeError('Failed to fetch'))),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Linear actions are unavailable.')
    ).toBeVisible();
  },
};

/** Right-to-left: decision rows inside an RTL document. */
export const RtlDocument: Story = {
  beforeEach: () =>
    stubTimActions(async () =>
      Response.json(response({ issues: [issue(1, 'مراجعة دفعة المدفوعات')] }))
    ),
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('مراجعة دفعة المدفوعات')
    ).toBeVisible();
  },
};
