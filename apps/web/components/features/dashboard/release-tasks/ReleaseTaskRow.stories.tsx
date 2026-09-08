import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';
import { ReleaseTaskRow } from './ReleaseTaskRow';

const task: ReleaseTaskView = {
  id: 'task-story',
  releaseId: 'release-story',
  creatorProfileId: 'profile-story',
  templateItemId: 'template-story',
  title: 'Pitch playlist editors',
  description: null,
  explainerText: 'Share the release with curators who fit the track.',
  learnMoreUrl: '/releases/release-story',
  videoUrl: null,
  category: 'Marketing',
  status: 'todo',
  priority: 'high',
  position: 1,
  assigneeType: 'human',
  assigneeUserId: null,
  aiWorkflowId: null,
  dueDaysOffset: 3,
  dueDate: new Date('2026-09-10T00:00:00.000Z'),
  completedAt: null,
  metadata: null,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
};

const meta = {
  title: 'Features/Dashboard/Release Tasks/ReleaseTaskRow',
  component: ReleaseTaskRow,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-96 rounded-lg border border-subtle bg-surface-1 p-2'>
        <Story />
      </div>
    ),
  ],
  args: {
    task,
    onToggle: fn(),
  },
} satisfies Meta<typeof ReleaseTaskRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Todo: Story = {};

export const Done: Story = {
  args: {
    task: {
      ...task,
      status: 'done',
      completedAt: new Date('2026-09-08T00:00:00.000Z'),
    },
  },
};
