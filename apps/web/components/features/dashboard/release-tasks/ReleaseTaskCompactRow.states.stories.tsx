import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';
import { ReleaseTaskCompactRow } from './ReleaseTaskCompactRow';

const task: ReleaseTaskView = {
  id: 'task-state',
  releaseId: 'release-state',
  creatorProfileId: 'profile-state',
  templateItemId: 'template-state',
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
  dueDate: null,
  completedAt: null,
  metadata: null,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
};

function NarrowFrame({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className='w-72 rounded-lg border border-subtle bg-surface-1 p-2'>
      {children}
    </div>
  );
}

const meta = {
  title: 'Features/Dashboard/Release Tasks/ReleaseTaskCompactRow/States',
  component: ReleaseTaskCompactRow,
  parameters: { layout: 'centered' },
  decorators: [
    function NarrowDecorator(Story) {
      return (
        <NarrowFrame>
          <Story />
        </NarrowFrame>
      );
    },
  ],
  args: { task, onNavigate: fn(), onToggle: fn() },
} satisfies Meta<typeof ReleaseTaskCompactRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: a finished task with no due date left to show. */
export const Partial: Story = {
  args: { task: { ...task, status: 'done', completedAt: new Date() } },
};

/** Long content: a title that truncates inside the row. */
export const LongContent: Story = {
  args: {
    task: {
      ...task,
      title:
        'Pitch every independent playlist editor and radio programmer on the release-day shortlist',
    },
  },
};

/** Rtl: a right-to-left title. */
export const Rtl: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
  args: { task: { ...task, title: 'التواصل مع محرري قوائم التشغيل' } },
};
