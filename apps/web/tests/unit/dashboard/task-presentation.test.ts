import { describe, expect, it } from 'vitest';
import {
  getTaskPriorityMeta,
  getTaskVisualStage,
} from '@/components/features/dashboard/tasks/task-presentation';

describe('task-presentation', () => {
  it('maps in-progress review states to the 75 percent stage', () => {
    expect(getTaskVisualStage('in_progress', 'awaiting_review')).toMatchObject({
      label: 'In Progress',
      percent: 75,
      accent: 'orange',
      isTerminal: false,
    });

    expect(getTaskVisualStage('in_progress', 'approved')).toMatchObject({
      label: 'In Progress',
      percent: 75,
      accent: 'orange',
      isTerminal: false,
    });
  });

  it('maps active draft work to the 50 percent stage', () => {
    expect(getTaskVisualStage('in_progress', 'drafting')).toMatchObject({
      label: 'In Progress',
      percent: 50,
      accent: 'purple',
      isTerminal: false,
    });
  });

  it('maps terminal states and priorities deterministically', () => {
    expect(getTaskVisualStage('done', 'approved')).toMatchObject({
      label: 'Done',
      percent: 100,
      accent: 'green',
      isTerminal: true,
    });

    expect(getTaskVisualStage('todo', 'idle')).toMatchObject({
      label: 'Not Started',
      percent: 25,
      accent: 'blue',
      isTerminal: false,
    });

    expect(getTaskVisualStage('cancelled', 'failed')).toMatchObject({
      label: 'Cancelled',
      percent: 0,
      accent: 'gray',
      isTerminal: true,
    });

    expect(getTaskPriorityMeta('none')).toBeNull();
    expect(getTaskPriorityMeta('high')).toMatchObject({
      label: 'High',
      accent: 'orange',
    });
  });
});
