import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { queryKeys } from '@/lib/queries';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';
import { ReleaseTaskChecklist } from './ReleaseTaskChecklist';

const releaseId = 'storybook-release-states';

function task(overrides: Partial<ReleaseTaskView>): ReleaseTaskView {
  return {
    id: 'task-pitch',
    releaseId,
    creatorProfileId: 'storybook-profile',
    templateItemId: 'template-pitch',
    title: 'Pitch playlist editors',
    description: null,
    explainerText: null,
    learnMoreUrl: null,
    videoUrl: null,
    category: 'Marketing',
    status: 'todo',
    priority: 'medium',
    position: 1,
    assigneeType: 'human',
    assigneeUserId: null,
    aiWorkflowId: null,
    dueDaysOffset: 3,
    dueDate: new Date('2026-09-01T00:00:00.000Z'),
    completedAt: null,
    metadata: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

type Seed = 'pending' | 'error' | readonly ReleaseTaskView[];

function makeClient(seed: Seed) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  const key = queryKeys.releaseTasks.byRelease(releaseId);
  client.setQueryData(['release-catalog', 'v1'], []);
  client.setQueryData(['release-skill-clusters', 'v1'], []);
  if (seed === 'pending') {
    void client.prefetchQuery({
      queryKey: key,
      queryFn: () => new Promise<ReleaseTaskView[]>(() => {}),
    });
  } else if (seed === 'error') {
    void client.prefetchQuery({
      queryKey: key,
      queryFn: () => Promise.reject(new Error('Tasks failed to load')),
    });
  } else {
    client.setQueryData(key, seed);
  }
  return client;
}

function SeededChecklist({
  seed,
  offline = false,
  children,
}: {
  readonly seed: Seed;
  readonly offline?: boolean;
  readonly children: ReactNode;
}) {
  const [client] = useState(() => makeClient(seed));
  useEffect(() => {
    if (!offline) return;
    onlineManager.setOnline(false);
    return () => onlineManager.setOnline(true);
  }, [offline]);
  return (
    <QueryClientProvider client={client}>
      <div className='max-w-xl'>{children}</div>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Dashboard/ReleaseTasks/ReleaseTaskChecklist/States',
  component: ReleaseTaskChecklist,
  parameters: { layout: 'padded' },
  args: { releaseId, variant: 'full', releaseDate: '2099-09-15' },
} satisfies Meta<typeof ReleaseTaskChecklist>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the task query is still in flight, so a skeleton holds the space. */
export const LoadingTasks: Story = {
  decorators: [
    function PendingTasks(Story) {
      return (
        <SeededChecklist seed='pending'>
          <Story />
        </SeededChecklist>
      );
    },
  ],
};

/** Empty: an upcoming release with no tasks offers to generate a plan. */
export const EmptyUpcomingRelease: Story = {
  decorators: [
    function NoTasks(Story) {
      return (
        <SeededChecklist seed={[]}>
          <Story />
        </SeededChecklist>
      );
    },
  ],
};

/** Error: a failed task query falls back to the generate-a-plan state. */
export const ErrorTasksFailedToLoad: Story = {
  decorators: [
    function FailedTasks(Story) {
      return (
        <SeededChecklist seed='error'>
          <Story />
        </SeededChecklist>
      );
    },
  ],
};

/** Partial: tasks without a category or due date land in the Other group. */
export const PartialUncategorisedTasks: Story = {
  decorators: [
    function UncategorisedTasks(Story) {
      return (
        <SeededChecklist
          seed={[
            task({}),
            task({
              id: 'task-loose',
              title: 'Back up the masters',
              category: null,
              dueDate: null,
              dueDaysOffset: null,
            }),
          ]}
        >
          <Story />
        </SeededChecklist>
      );
    },
  ],
};

/** Long content: many groups and long task titles in the compact rail. */
export const LongContentManyTasks: Story = {
  args: { variant: 'compact', onNavigateToFullPage: () => {} },
  decorators: [
    function ManyTasks(Story) {
      return (
        <SeededChecklist
          seed={Array.from({ length: 18 }, (_, i) =>
            task({
              id: `task-${i}`,
              title: `Follow up with every playlist curator, blog editor and radio contact from round ${i + 1}`,
              category: ['Marketing', 'Press', 'Distribution'][i % 3],
              status: i % 4 === 0 ? 'done' : 'todo',
              position: i,
            })
          )}
        >
          <div className='h-96'>
            <Story />
          </div>
        </SeededChecklist>
      );
    },
  ],
};

/** Offline: the network is gone; cached tasks stay visible. */
export const OfflineCachedTasks: Story = {
  decorators: [
    function OfflineTasks(Story) {
      return (
        <SeededChecklist offline seed={[task({})]}>
          <Story />
        </SeededChecklist>
      );
    },
  ],
};

/** Right-to-left: Arabic tasks in an Arabic document direction. */
export const RtlArabicTasks: Story = {
  decorators: [
    function ArabicTasks(Story) {
      return (
        <SeededChecklist
          seed={[
            task({
              title: 'تواصل مع محرري قوائم التشغيل',
              category: 'التسويق',
            }),
          ]}
        >
          <div dir='rtl' lang='ar'>
            <Story />
          </div>
        </SeededChecklist>
      );
    },
  ],
};
