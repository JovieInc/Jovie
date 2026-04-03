import { describe, expect, it } from 'vitest';
import {
  getTaskAssigneeVisual,
  getTaskPriorityVisual,
  getTaskStageVisual,
  getTaskStatusVisual,
} from './task-presentation';

describe('task-presentation', () => {
  it('maps in-progress review states to the 75 percent stage', () => {
    expect(getTaskStageVisual('in_progress', 'awaiting_review')).toMatchObject({
      label: 'In Progress',
      percent: 75,
      accent: 'orange',
      isTerminal: false,
    });

    expect(getTaskStageVisual('in_progress', 'approved')).toMatchObject({
      label: 'In Progress',
      percent: 75,
      accent: 'orange',
      isTerminal: false,
    });
  });

  it('maps active draft work to the 50 percent stage', () => {
    expect(getTaskStageVisual('in_progress', 'drafting')).toMatchObject({
      label: 'In Progress',
      percent: 50,
      accent: 'blue',
      isTerminal: false,
    });
  });

  it('maps terminal states and priorities deterministically', () => {
    expect(getTaskStageVisual('done', 'approved')).toMatchObject({
      label: 'Done',
      percent: 100,
      accent: 'green',
      isTerminal: true,
    });

    expect(getTaskStageVisual('todo', 'idle')).toMatchObject({
      label: 'Not Started',
      percent: 25,
      accent: 'blue',
      isTerminal: false,
    });

    expect(getTaskStageVisual('cancelled', 'failed')).toMatchObject({
      label: 'Cancelled',
      percent: 0,
      accent: 'gray',
      isTerminal: true,
    });

    expect(getTaskStatusVisual('done')).toMatchObject({
      label: 'Done',
      accent: 'green',
      filled: true,
    });

    expect(getTaskPriorityVisual('none')).toMatchObject({
      label: 'None',
      accent: 'gray',
    });

    expect(getTaskPriorityVisual('high')).toMatchObject({
      label: 'High',
      accent: 'orange',
    });

    expect(getTaskAssigneeVisual('human', 'Tim White')).toMatchObject({
      label: 'You',
      avatarName: 'Tim White',
      accent: 'blue',
    });
  });
});
