import '@/app/globals.css';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ComponentProps, useState } from 'react';
import { AppShellRightRail } from '@/components/shell/AppShellRightRail';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import type { ShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';
import { OperationalTasksPanelView } from './OperationalTasksPanel';

type OperationalTaskFeed = ShippingCockpitProjection['operationalTasks'];

function feed(
  overrides: Partial<OperationalTaskFeed> = {}
): OperationalTaskFeed {
  return {
    canonicalSource: 'linear',
    cacheMode: 'local-reconciled',
    syncState: 'fresh',
    sourceId: 'lane-pull-requests',
    observedAt: '2026-09-01T22:00:00.000Z',
    lastSyncedAt: '2026-09-01T22:00:00.000Z',
    freshnessDeadline: '2026-09-01T22:00:10.000Z',
    tasks: [
      {
        id: 'linear:JOV-5544',
        linearIdentifier: 'JOV-5544',
        linearUrl: 'https://linear.app/jovie/issue/JOV-5544/cache-symphony',
        title: 'Cache Symphony workspaces on NVMe',
        workflowState: 'running',
        priority: 'high',
        attempt: 2,
        retryAt: null,
        sourceRevision: 'rev-2',
        updatedAt: '2026-09-01T22:00:00.000Z',
      },
    ],
    deltas: [],
    ...overrides,
  };
}

function StoryRail() {
  const rightPanel = useRightPanel();
  return <AppShellRightRail>{rightPanel}</AppShellRightRail>;
}

function InteractiveTasks(
  args: ComponentProps<typeof OperationalTasksPanelView>
) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  return (
    <div className='flex h-svh min-w-0 bg-(--app-shell-content-surface)'>
      <div className='min-w-0 flex-1 overflow-y-auto p-4'>
        <OperationalTasksPanelView
          {...args}
          selectedTaskId={selectedTaskId}
          onSelectTask={setSelectedTaskId}
        />
      </div>
      {args.presentation === 'page' ? <StoryRail /> : null}
    </div>
  );
}

const meta = {
  title: 'Features/Admin/Hud/OperationalTasksPanel',
  component: OperationalTasksPanelView,
  parameters: { layout: 'fullscreen' },
  render: args => (
    <RightPanelProvider>
      <InteractiveTasks {...args} />
    </RightPanelProvider>
  ),
} satisfies Meta<typeof OperationalTasksPanelView>;
export default meta;
type Story = StoryObj<typeof OperationalTasksPanelView>;

export const FreshTasks: Story = {
  args: { feed: feed(), requestState: 'idle' },
};

export const StaleAfterError: Story = {
  args: { feed: feed(), requestState: 'error' },
};

export const SyncFailedEmpty: Story = {
  args: {
    feed: feed({
      syncState: 'failed',
      lastSyncedAt: null,
      observedAt: null,
      freshnessDeadline: null,
      tasks: [],
      deltas: [],
    }),
    requestState: 'error',
  },
};

export const EmptyIdle: Story = {
  args: {
    feed: feed({ tasks: [], deltas: [], lastSyncedAt: null }),
    requestState: 'idle',
  },
};

export const Standalone: Story = {
  args: {
    feed: feed({
      tasks: Array.from({ length: 20 }, (_, i) => ({
        ...feed().tasks[0],
        id: `task-${i}`,
        linearIdentifier: `JOV-${5544 + i}`,
      })),
    }),
    presentation: 'page',
  },
};
export const StandaloneLight: Story = {
  ...Standalone,
  parameters: { themes: { themeOverride: 'light' } },
};
