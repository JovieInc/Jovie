import '@/app/globals.css';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ComponentProps, useState } from 'react';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import type { ShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';
import { OperationalTasksPanelView } from './OperationalTasksPanel';

type OperationalTaskFeed = ShippingCockpitProjection['operationalTasks'];
type ViewProps = ComponentProps<typeof OperationalTasksPanelView>;

const task: OperationalTaskFeed['tasks'][number] = {
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
};

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
    tasks: [task],
    deltas: [],
    ...overrides,
  };
}

function TasksFrame({
  dir = 'ltr',
  ...args
}: ViewProps & { readonly dir?: 'ltr' | 'rtl' }) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  return (
    <RightPanelProvider>
      <div dir={dir} className='w-full max-w-xl p-4'>
        <OperationalTasksPanelView
          {...args}
          selectedTaskId={selectedTaskId}
          onSelectTask={setSelectedTaskId}
        />
      </div>
    </RightPanelProvider>
  );
}

function renderTasks(args: ViewProps) {
  return <TasksFrame {...args} />;
}

const meta = {
  title: 'Features/Admin/Hud/OperationalTasksPanel States',
  component: OperationalTasksPanelView,
  parameters: { layout: 'fullscreen' },
  render: renderTasks,
} satisfies Meta<typeof OperationalTasksPanelView>;

export default meta;
type Story = StoryObj<typeof OperationalTasksPanelView>;

/** Loading: the first fetch is in flight and nothing has synced yet. */
export const LoadingFirstSync: Story = {
  args: {
    feed: feed({
      syncState: 'syncing',
      lastSyncedAt: null,
      observedAt: null,
      freshnessDeadline: null,
      tasks: [],
    }),
    requestState: 'fetching',
  },
};

/** Error: the request failed on a cold cache, so active tasks are unknown. */
export const ErrorSyncFailedColdCache: Story = {
  args: {
    feed: feed({
      syncState: 'failed',
      lastSyncedAt: null,
      observedAt: null,
      freshnessDeadline: null,
      tasks: [],
    }),
    requestState: 'error',
  },
};

/** Partial: a task with no Linear link, attempt, retry or transition. */
export const PartialTaskWithoutLinkOrAttempt: Story = {
  args: {
    feed: feed({
      tasks: [
        {
          ...task,
          linearUrl: null,
          attempt: null,
          workflowState: 'queued',
        },
      ],
    }),
  },
};

/** Offline: the request failed but last-known tasks stay, labelled stale. */
export const OfflineStaleLastKnownTasks: Story = {
  args: { feed: feed(), requestState: 'error' },
};

const STATES = [
  'running',
  'retrying',
  'blocked',
  'merge-queued',
  'in-review',
  'production-verified',
] as const;

const longFeed = feed({
  tasks: STATES.map((workflowState, index) => ({
    ...task,
    id: `linear:JOV-${5600 + index}`,
    linearIdentifier: `JOV-${5600 + index}`,
    linearUrl: `https://linear.app/jovie/issue/JOV-${5600 + index}/long`,
    title: `Rebuild the release-day smart link router so every storefront region resolves to the live release before the pre-save window opens (${index + 1})`,
    workflowState,
    attempt: 12 + index,
    retryAt: workflowState === 'retrying' ? '2026-09-01T22:05:00.000Z' : null,
  })),
  deltas: [
    {
      taskId: 'linear:JOV-5601',
      kind: 'updated',
      fromState: 'running',
      toState: 'retrying',
      sequence: 3,
    },
  ],
});

/** Long content: six long-titled tasks across every workflow state. */
export const LongContentManyTasks: Story = { args: { feed: longFeed } };

function renderRtl(args: ViewProps) {
  return <TasksFrame {...args} dir='rtl' />;
}

/** RTL: Arabic task titles in a right-to-left container. */
export const RtlArabicTasks: Story = {
  args: {
    feed: feed({
      tasks: [
        { ...task, title: 'تخزين مساحات العمل مؤقتًا على وحدة التخزين السريعة' },
        {
          ...task,
          id: 'linear:JOV-5545',
          linearIdentifier: 'JOV-5545',
          title: 'إعادة بناء موجّه الروابط الذكية ليوم الإصدار',
          workflowState: 'blocked',
          attempt: null,
        },
      ],
    }),
  },
  render: renderRtl,
};
