import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import * as React from 'react';
import type { TimActionsResponse } from '@/lib/hud/linear-actions';
import { TimActionRequiredSection } from './TimActionRequiredSection';

const TIM_ACTIONS_URL = '/api/admin/hud/tim-actions';

const defaultResponse: TimActionsResponse = {
  issues: [
    {
      id: 'issue-1',
      identifier: 'JOV-6101',
      title: 'Approve payout batch for September creators',
      url: 'https://linear.app/jovie/issue/JOV-6101',
      priority: 1,
      priorityLabel: 'Urgent',
      createdAt: '2026-09-19T00:00:00.000Z',
      daysOld: 9,
      stateType: 'started',
    },
    {
      id: 'issue-2',
      identifier: 'JOV-6114',
      title: 'Review revised creator onboarding copy',
      url: 'https://linear.app/jovie/issue/JOV-6114',
      priority: 3,
      priorityLabel: 'Medium',
      createdAt: '2026-09-25T00:00:00.000Z',
      daysOld: 3,
      stateType: 'unstarted',
    },
  ],
  fetchedAt: '2026-09-28T00:00:00.000Z',
  available: true,
  observation: 'ok',
  errorMessage: null,
};

function createTimActionsFetchMock(
  response: TimActionsResponse | null,
  status: number,
  originalFetch: typeof fetch,
  isLoading: boolean
): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes(TIM_ACTIONS_URL)) {
      if (isLoading) {
        return new Promise<Response>(() => undefined);
      }
      if (status !== 200 || response === null) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'unavailable' }), { status })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify(response), { status: 200 })
      );
    }
    return originalFetch(input as RequestInfo, init);
  }) as typeof fetch;
}

function TimActionRequiredStory({
  isLoading = false,
  response = defaultResponse,
  status = 200,
  presentation = 'section',
}: {
  readonly presentation?: 'section' | 'page';
  readonly isLoading?: boolean;
  readonly response?: TimActionsResponse | null;
  readonly status?: number;
}) {
  const originalFetchRef = React.useRef<typeof fetch | null>(null);

  React.useLayoutEffect(() => {
    originalFetchRef.current = globalThis.fetch;
    globalThis.fetch = createTimActionsFetchMock(
      response,
      status,
      globalThis.fetch,
      isLoading
    );
    return () => {
      if (originalFetchRef.current) {
        globalThis.fetch = originalFetchRef.current;
      }
    };
  }, [isLoading, response, status]);

  return (
    <div className='max-w-2xl'>
      <TimActionRequiredSection presentation={presentation} />
    </div>
  );
}

const meta = {
  title: 'Admin/Hud/TimActionRequiredSection',
  component: TimActionRequiredSection,
  parameters: {
    layout: 'padded',
    // onClose/isClosing/disabled are internal ActionRow + Button concerns,
    // not props of the exported TimActionRequiredSection.
    jovie: { uncoveredProps: ['onClose', 'isClosing', 'disabled'] },
  },
} satisfies Meta<typeof TimActionRequiredSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <TimActionRequiredStory />,
};

export const Empty: Story = {
  render: () => (
    <TimActionRequiredStory
      response={{ ...defaultResponse, issues: [], observation: 'empty' }}
    />
  ),
};

export const Locked: Story = {
  render: () => <TimActionRequiredStory response={null} status={403} />,
};

export const Unavailable: Story = {
  render: () => <TimActionRequiredStory response={null} status={500} />,
};

export const NotConfigured: Story = {
  render: () => (
    <TimActionRequiredStory
      response={{
        ...defaultResponse,
        issues: [],
        available: false,
        observation: 'not_configured',
        errorMessage: null,
      }}
    />
  ),
};

export const Loading: Story = {
  render: () => <TimActionRequiredStory isLoading />,
};

export const StandalonePage: Story = {
  render: () => <TimActionRequiredStory presentation='page' />,
};

export const StandaloneLight: Story = {
  ...StandalonePage,
  parameters: { themes: { themeOverride: 'light' } },
};
