import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  isReleaseTaskAutomated,
  isReleaseTaskDone,
  ReleaseTaskAutoBadge,
  ReleaseTaskCheckbox,
  ReleaseTaskTitleText,
} from './ReleaseTaskRowPrimitives';

function createTask(overrides: Partial<ReleaseTaskView> = {}): ReleaseTaskView {
  return {
    id: 'task_1',
    releaseId: 'release_1',
    creatorProfileId: 'profile_1',
    templateItemId: 'template_1',
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
    dueDate: new Date('2026-06-01T00:00:00.000Z'),
    completedAt: null,
    metadata: null,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('ReleaseTaskRowPrimitives', () => {
  it('reads done and automated from the task', () => {
    expect(isReleaseTaskDone(createTask({ status: 'done' }))).toBe(true);
    expect(isReleaseTaskDone(createTask())).toBe(false);
    expect(
      isReleaseTaskAutomated(createTask({ assigneeType: 'ai_workflow' }))
    ).toBe(true);
    expect(isReleaseTaskAutomated(createTask())).toBe(false);
  });

  it('toggles a task through the labelled checkbox', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <ReleaseTaskCheckbox
        task={createTask()}
        isDone={false}
        onToggle={onToggle}
      />
    );
    await expectNoA11yViolations(container);
    await user.click(
      screen.getByRole('checkbox', {
        name: 'Mark "Pitch playlist editors" as complete',
      })
    );
    expect(onToggle).toHaveBeenCalledWith('task_1', true);
  });

  it('locks the checkbox for automated tasks', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <ReleaseTaskCheckbox
        task={createTask({ assigneeType: 'ai_workflow' })}
        isDone={false}
        onToggle={onToggle}
      />
    );
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeDisabled();
    await user.click(checkbox);
    expect(onToggle).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('strikes through done titles and truncates long ones', async () => {
    const title =
      'Pitch the deluxe edition to every editorial playlist curator who featured the lead single';
    const { container } = render(
      <div>
        <ReleaseTaskTitleText isDone>{title}</ReleaseTaskTitleText>
        <ReleaseTaskAutoBadge>Auto</ReleaseTaskAutoBadge>
      </div>
    );
    const text = screen.getByText(title);
    expect(text).toHaveClass('truncate', 'line-through', 'text-tertiary-token');
    expect(screen.getByText('Auto')).toHaveClass('text-3xs');
    await expectNoA11yViolations(container);
  });

  it('stays accessible right to left', async () => {
    const title = 'التواصل مع محرري قوائم التشغيل';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ReleaseTaskCheckbox
          task={createTask({ title })}
          isDone={false}
          onToggle={vi.fn()}
        />
        <ReleaseTaskTitleText isDone={false}>{title}</ReleaseTaskTitleText>
      </div>
    );
    expect(
      screen.getByRole('checkbox', { name: `Mark "${title}" as complete` })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
