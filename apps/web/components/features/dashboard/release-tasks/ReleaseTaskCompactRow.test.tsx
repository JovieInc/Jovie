import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ReleaseTaskCompactRow } from './ReleaseTaskCompactRow';

const task: ReleaseTaskView = {
  id: 'task-1',
  releaseId: 'release-1',
  creatorProfileId: 'profile-1',
  templateItemId: 'template-1',
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

describe('ReleaseTaskCompactRow', () => {
  it('navigates from the title and toggles from the checkbox', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const onToggle = vi.fn();
    const { container } = render(
      <ReleaseTaskCompactRow
        task={task}
        onNavigate={onNavigate}
        onToggle={onToggle}
      />
    );

    const title = screen.getByRole('button', {
      name: /Pitch playlist editors/,
    });
    expect(title).toHaveAttribute('type', 'button');
    await user.click(title);
    expect(onNavigate).toHaveBeenCalledWith('task-1');

    await user.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledWith('task-1', true);
    await expectNoA11yViolations(container);
  });

  it('marks automated tasks with an AI badge and locks the checkbox', async () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ReleaseTaskCompactRow
        task={{ ...task, assigneeType: 'ai_workflow', aiWorkflowId: 'wf' }}
        onNavigate={vi.fn()}
        onToggle={onToggle}
      />
    );

    expect(screen.getByText('AI')).toHaveClass('text-accent-purple');
    expect(screen.getByRole('checkbox')).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('renders a finished task', async () => {
    const { container } = render(
      <ReleaseTaskCompactRow
        task={{ ...task, status: 'done' }}
        onNavigate={vi.fn()}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByRole('checkbox')).toBeChecked();
    await expectNoA11yViolations(container);
  });
});
