import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queries';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';
import { ReleaseTaskPage, ReleaseTaskPageSkeleton } from './ReleaseTaskPage';

const releaseId = 'storybook-release';

const tasks: ReleaseTaskView[] = [
  {
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
  },
  {
    id: 'task-fans',
    releaseId,
    creatorProfileId: 'storybook-profile',
    templateItemId: 'template-fans',
    title: 'Notify your core fans',
    description: null,
    explainerText: null,
    learnMoreUrl: null,
    videoUrl: null,
    category: 'Fan engagement',
    status: 'todo',
    priority: 'medium',
    position: 2,
    assigneeType: 'human',
    assigneeUserId: null,
    aiWorkflowId: null,
    dueDaysOffset: 5,
    dueDate: new Date('2026-09-03T00:00:00.000Z'),
    completedAt: null,
    metadata: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  },
];

function createStoryQueryClient() {
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

const storyQueryClient = createStoryQueryClient();

const meta = {
  title: 'Dashboard/Release Tasks/ReleaseTaskPage',
  component: ReleaseTaskPage,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <QueryClientProvider client={storyQueryClient}>
        <div className='min-h-screen bg-base text-primary-token'>
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
  args: {
    profileId: 'storybook-profile',
    releaseId,
    releaseTitle: 'The Deep End',
    releaseDate: '2026-09-15',
  },
} satisfies Meta<typeof ReleaseTaskPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UpNext: Story = {};

export const Loading: Story = {
  render: () => <ReleaseTaskPageSkeleton />,
};
