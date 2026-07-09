import { describe, expect, it } from 'vitest';
import {
  getTaskAssigneeVisual,
  getTaskCategoryLabel,
  getTaskPriorityVisual,
  getTaskStageVisual,
  getTaskStatusVisual,
  isTaskAgentWorking,
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
      label: 'Me',
      avatarName: 'Me',
      accent: 'blue',
    });

    // Release/song titles must never surface as the assignee chip (GH-12331).
    expect(getTaskAssigneeVisual('human', 'Take Me Over')).toMatchObject({
      label: 'Me',
      avatarName: 'Me',
    });
    expect(
      getTaskAssigneeVisual('jovie', "Love Don't Let Me Down")
    ).toMatchObject({
      label: 'Jovie',
      avatarName: 'Jovie',
    });
  });

  it('Title-Cases category labels and degrades on blank input', () => {
    expect(getTaskCategoryLabel('distribution')).toBe('Distribution');
    expect(getTaskCategoryLabel('  design ')).toBe('Design');
    expect(getTaskCategoryLabel('')).toBeNull();
    expect(getTaskCategoryLabel('   ')).toBeNull();
    expect(getTaskCategoryLabel(null)).toBeNull();
    expect(getTaskCategoryLabel(undefined)).toBeNull();
  });

  it('flags the agent-working glyph only for live Jovie in-progress work', () => {
    expect(isTaskAgentWorking('jovie', 'in_progress', 'drafting')).toBe(true);
    expect(isTaskAgentWorking('jovie', 'in_progress', 'queued')).toBe(true);
    expect(isTaskAgentWorking('jovie', 'in_progress', 'awaiting_review')).toBe(
      true
    );
    // Terminal / idle agent states are not "in-flight".
    expect(isTaskAgentWorking('jovie', 'in_progress', 'idle')).toBe(false);
    expect(isTaskAgentWorking('jovie', 'in_progress', 'approved')).toBe(false);
    expect(isTaskAgentWorking('jovie', 'in_progress', 'failed')).toBe(false);
    // Human-owned or non-active statuses never show the glyph.
    expect(isTaskAgentWorking('human', 'in_progress', 'drafting')).toBe(false);
    expect(isTaskAgentWorking('jovie', 'todo', 'drafting')).toBe(false);
    expect(isTaskAgentWorking('jovie', 'done', 'approved')).toBe(false);
  });
});
