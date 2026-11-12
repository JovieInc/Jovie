import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ReleaseTaskRow } from './ReleaseTaskRow';

function createTask(overrides: Partial<ReleaseTaskView> = {}): ReleaseTaskView {
  return {
    id: 'task_1',
    releaseId: 'release_1',
    creatorProfileId: 'profile_1',
    templateItemId: 'template_1',
    title: 'Pitch playlist editors',
    description: null,
    explainerText: 'Share the release with curators who fit the track.',
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
    dueDate: new Date('2026-06-01T00:00:00.000Z'),
    completedAt: null,
    metadata: null,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('ReleaseTaskRow', () => {
  it('marks a todo task complete from its checkbox', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <ReleaseTaskRow task={createTask()} onToggle={onToggle} />
    );
    expect(screen.getByTitle('high')).toHaveTextContent('•••');
    await expectNoA11yViolations(container);

    await user.click(
      screen.getByRole('checkbox', {
        name: 'Mark "Pitch playlist editors" as complete',
      })
    );
    expect(onToggle).toHaveBeenCalledWith('task_1', true);
  });

  it('reopens a done task and strikes its title through', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <ReleaseTaskRow
        task={createTask({
          status: 'done',
          completedAt: new Date('2026-06-02T00:00:00.000Z'),
        })}
        onToggle={onToggle}
      />
    );
    expect(screen.getByText('Pitch playlist editors')).toHaveClass(
      'line-through'
    );
    await expectNoA11yViolations(container);

    await user.click(
      screen.getByRole('checkbox', {
        name: 'Mark "Pitch playlist editors" as incomplete',
      })
    );
    expect(onToggle).toHaveBeenCalledWith('task_1', false);
  });

  it('labels automated tasks and locks their checkbox', async () => {
    const { container } = render(
      <ReleaseTaskRow
        task={createTask({ assigneeType: 'ai_workflow', priority: 'none' })}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByText('Auto')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.queryByTitle('none')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps a long title whole in the truncating cell', async () => {
    const title =
      'Pitch the deluxe edition to every editorial playlist curator who featured the lead single, with the new artwork attached';
    const { container } = render(
      <ReleaseTaskRow task={createTask({ title })} onToggle={vi.fn()} />
    );
    expect(screen.getByText(title)).toHaveClass('truncate');
    await expectNoA11yViolations(container);
  });

  it('stays accessible right to left', async () => {
    const title = 'التواصل مع محرري قوائم التشغيل';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ReleaseTaskRow task={createTask({ title })} onToggle={vi.fn()} />
      </div>
    );
    expect(
      screen.getByRole('checkbox', { name: `Mark "${title}" as complete` })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
