import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, within } from 'storybook/test';
import { queryKeys } from '@/lib/queries';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';
import { ReleaseTaskPage } from './ReleaseTaskPage';

const LONG_RELEASE_TITLE =
  'The Deep End (Tenth Anniversary Remastered Deluxe Edition with Bonus Live Sessions and Demos)';
const LONG_TASK_TITLE =
  'Pitch every independent playlist editor, regional radio programmer and newsletter curator who covered the previous record';

function createTask(
  releaseId: string,
  overrides: Partial<ReleaseTaskView>
): ReleaseTaskView {
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
    priority: 'high',
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

/** Each state gets its own release id so seeded task lists never collide. */
function createSeededClient(releaseId: string, tasks: ReleaseTaskView[]) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  client.setQueryData(queryKeys.releaseTasks.byRelease(releaseId), tasks);
  client.setQueryData(['release-catalog', 'v1'], []);
  client.setQueryData(['release-skill-clusters', 'v1'], []);
  return client;
}

const EMPTY_RELEASE_ID = 'storybook-release-empty';
const PARTIAL_RELEASE_ID = 'storybook-release-partial';
const LONG_RELEASE_ID = 'storybook-release-long';
const RTL_RELEASE_ID = 'storybook-release-rtl';

const emptyClient = createSeededClient(EMPTY_RELEASE_ID, []);
const partialClient = createSeededClient(PARTIAL_RELEASE_ID, [
  createTask(PARTIAL_RELEASE_ID, {
    id: 'task-done',
    title: 'Upload final masters',
    status: 'done',
  }),
  createTask(PARTIAL_RELEASE_ID, {
    id: 'task-undated',
    title: 'Draft the announcement',
    category: 'Fan engagement',
    position: 2,
    dueDaysOffset: null,
    dueDate: null,
  }),
]);
const longClient = createSeededClient(LONG_RELEASE_ID, [
  createTask(LONG_RELEASE_ID, { id: 'task-long', title: LONG_TASK_TITLE }),
]);
const rtlClient = createSeededClient(RTL_RELEASE_ID, [
  createTask(RTL_RELEASE_ID, { id: 'task-rtl' }),
  createTask(RTL_RELEASE_ID, {
    id: 'task-rtl-fans',
    title: 'Notify your core fans',
    category: 'Fan engagement',
    position: 2,
    dueDate: new Date('2026-09-03T00:00:00.000Z'),
  }),
]);

const withEmptyTasks: Decorator = Story => (
  <QueryClientProvider client={emptyClient}>
    <Story />
  </QueryClientProvider>
);

const withPartialTasks: Decorator = Story => (
  <QueryClientProvider client={partialClient}>
    <Story />
  </QueryClientProvider>
);

const withLongTasks: Decorator = Story => (
  <QueryClientProvider client={longClient}>
    <div className='w-full max-w-sm'>
      <Story />
    </div>
  </QueryClientProvider>
);

const withRtlTasks: Decorator = Story => (
  <QueryClientProvider client={rtlClient}>
    <div dir='rtl'>
      <Story />
    </div>
  </QueryClientProvider>
);

const withPageSurface: Decorator = Story => (
  <div className='min-h-screen bg-base text-primary-token'>
    <Story />
  </div>
);

const meta = {
  title: 'Dashboard/Release Tasks/ReleaseTaskPage States',
  component: ReleaseTaskPage,
  parameters: { layout: 'fullscreen' },
  decorators: [withPageSurface],
  args: {
    profileId: 'storybook-profile',
    releaseId: EMPTY_RELEASE_ID,
    releaseTitle: 'The Deep End',
    releaseDate: '2026-09-15',
  },
} satisfies Meta<typeof ReleaseTaskPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the release has no tasks, so only the playbook empty state shows. */
export const EmptyNoTasks: Story = {
  decorators: [withEmptyTasks],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByTestId('release-task-empty-state')
    ).toBeInTheDocument();
    await expect(canvas.queryByRole('region', { name: 'Up next' })).toBeNull();
  },
};

/** Partial: one task is done and the only open task has no due date. */
export const PartialUndatedOpenTask: Story = {
  args: { releaseId: PARTIAL_RELEASE_ID },
  decorators: [withPartialTasks],
  play: async ({ canvasElement }) => {
    const upNext = within(
      within(canvasElement).getByRole('region', { name: 'Up next' })
    );
    await expect(
      upNext.getByRole('checkbox', {
        name: 'Mark "Draft the announcement" as complete',
      })
    ).toBeInTheDocument();
    await expect(upNext.queryByText('Upload final masters')).toBeNull();
  },
};

/** Long content: long release and task titles in a narrow column. */
export const LongContentTitles: Story = {
  args: { releaseId: LONG_RELEASE_ID, releaseTitle: LONG_RELEASE_TITLE },
  decorators: [withLongTasks],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      within(canvas.getByTestId('release-task-toolbar-context')).getByText(
        LONG_RELEASE_TITLE
      )
    ).toHaveAttribute('title', LONG_RELEASE_TITLE);
    await expect(
      canvas.getByTestId('release-task-up-next-card')
    ).toHaveTextContent(LONG_TASK_TITLE);
  },
};

/** Right-to-left: the task page inside an RTL document. */
export const RtlUpNext: Story = {
  args: { releaseId: RTL_RELEASE_ID },
  decorators: [withRtlTasks],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('link', { name: 'Back to releases' })
    ).toBeVisible();
    await expect(
      within(canvas.getByTestId('release-task-up-next-card')).getAllByRole(
        'checkbox'
      )
    ).toHaveLength(2);
  },
};
