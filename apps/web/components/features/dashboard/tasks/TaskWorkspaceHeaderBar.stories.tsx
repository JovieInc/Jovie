import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TaskWorkspaceHeaderBar } from './TaskWorkspaceHeaderBar';

const meta = {
  title: 'Features/Dashboard/Tasks/TaskWorkspaceHeaderBar',
  component: TaskWorkspaceHeaderBar,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: [
        'mode',
        'draftTitle',
        'taskCount',
        'subviews',
        'activeSubview',
        'onSubviewChange',
        'onDraftTitleChange',
        'onCancelCreate',
        'onSubmitCreate',
        'createPending',
        'filterCategories',
        'onClearFilters',
        'onCreateTask',
        'viewMode',
        'onViewModeChange',
        'showCancelledColumn',
        'onShowCancelledColumnChange',
      ],
    },
  },
} satisfies Meta<typeof TaskWorkspaceHeaderBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
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
    onSubmitCreate: () => {},
    createPending: false,
    filterCategories: [],
    onClearFilters: () => {},
    onCreateTask: () => {},
    viewMode: 'board',
    onViewModeChange: () => {},
    showCancelledColumn: false,
    onShowCancelledColumnChange: () => {},
  },
};
