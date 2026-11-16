import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ComponentProps, useState } from 'react';
import { TaskWorkspaceHeaderBar } from './TaskWorkspaceHeaderBar';

type HeaderBarProps = ComponentProps<typeof TaskWorkspaceHeaderBar>;

const BASE_ARGS: HeaderBarProps = {
  mode: 'default',
  draftTitle: '',
  taskCount: 12,
  subviews: [
    { id: 'all', label: 'All', count: 12 },
    { id: 'mine', label: 'Mine', count: 5 },
    { id: 'jovie', label: 'Jovie', count: 7 },
  ],
  activeSubview: 'all',
  onSubviewChange: () => {},
  onDraftTitleChange: () => {},
  onCancelCreate: () => {},
  onSubmitCreate: event => event.preventDefault(),
  createPending: false,
  filterCategories: [],
  onClearFilters: () => {},
  onCreateTask: () => {},
  viewMode: 'board',
  onViewModeChange: () => {},
  showCancelledColumn: false,
  onShowCancelledColumnChange: () => {},
};

/** Create mode with the draft held in story state, as the tasks page does. */
function CreateModeHarness(args: HeaderBarProps) {
  const [draftTitle, setDraftTitle] = useState(args.draftTitle);
  return (
    <TaskWorkspaceHeaderBar
      {...args}
      draftTitle={draftTitle}
      onDraftTitleChange={setDraftTitle}
    />
  );
}

/**
 * Rendered states of the tasks toolbar. The default render lives in
 * TaskWorkspaceHeaderBar.stories.tsx.
 */
const meta = {
  title: 'Features/Dashboard/Tasks/TaskWorkspaceHeaderBar/States',
  component: TaskWorkspaceHeaderBar,
  parameters: { layout: 'padded' },
  args: BASE_ARGS,
} satisfies Meta<typeof TaskWorkspaceHeaderBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no subviews yet, so the bar shows the task count alone. */
export const EmptySubviews: Story = {
  args: { subviews: [], taskCount: 0 },
};

/** Partial: task navigation shown with only the next task available. */
export const PartialNavigation: Story = {
  args: {
    viewMode: 'list',
    showTaskNavigation: true,
    canSelectPrevious: false,
    canSelectNext: true,
  },
};

/** Long content: a long draft title in create mode. */
export const LongContentDraftTitle: Story = {
  args: {
    mode: 'create',
    draftTitle:
      'Draft the press release for the summer single, update the artist bio and pitch the sync supervisor before Friday',
  },
  render: CreateModeHarness,
};

/** Pending: a create submit in flight keeps Create disabled. */
export const PendingCreate: Story = {
  args: { mode: 'create', draftTitle: 'Update bio', createPending: true },
  render: CreateModeHarness,
};

/** Right-to-left: Arabic subview labels in an Arabic document direction. */
export const RtlArabicSubviews: Story = {
  args: {
    subviews: [
      { id: 'all', label: 'الكل', count: 12 },
      { id: 'mine', label: 'مهامي', count: 5 },
      { id: 'jovie', label: 'جوفي', count: 7 },
    ],
  },
  decorators: [
    function RtlDirection(StoryComponent) {
      return (
        <div dir='rtl' lang='ar'>
          <StoryComponent />
        </div>
      );
    },
  ],
};
