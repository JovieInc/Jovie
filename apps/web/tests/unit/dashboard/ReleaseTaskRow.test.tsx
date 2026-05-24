import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReleaseTaskCompactRow } from '@/components/features/dashboard/release-tasks/ReleaseTaskCompactRow';
import { ReleaseTaskRow } from '@/components/features/dashboard/release-tasks/ReleaseTaskRow';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';

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

describe('ReleaseTaskRow', () => {
  it('renders the full row through the shared shell list row frame', () => {
    const { container } = render(
      <ReleaseTaskRow task={createTask()} onToggle={vi.fn()} />
    );

    expect(
      container.querySelectorAll('[data-shell-list-row="true"]')
    ).toHaveLength(1);
  });

  it('toggles the shared checkbox control from the full row', () => {
    const onToggle = vi.fn();

    render(<ReleaseTaskRow task={createTask()} onToggle={onToggle} />);

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Mark "Pitch playlist editors" as complete',
      })
    );

    expect(onToggle).toHaveBeenCalledWith('task_1', true);
  });

  it('disables the shared checkbox for automated tasks', () => {
    render(
      <ReleaseTaskRow
        task={createTask({ assigneeType: 'ai_workflow' })}
        onToggle={vi.fn()}
      />
    );

    expect(
      screen.getByRole('checkbox', {
        name: 'Mark "Pitch playlist editors" as complete',
      })
    ).toBeDisabled();
    expect(screen.getByText('Auto')).toBeInTheDocument();
  });
});

describe('ReleaseTaskCompactRow', () => {
  it('renders the compact row through the shared shell list row frame', () => {
    const { container } = render(
      <ReleaseTaskCompactRow
        task={createTask()}
        onNavigate={vi.fn()}
        onToggle={vi.fn()}
      />
    );

    expect(
      container.querySelectorAll('[data-shell-list-row="true"]')
    ).toHaveLength(1);
  });

  it('keeps compact navigation and checkbox behavior separate', () => {
    const onNavigate = vi.fn();
    const onToggle = vi.fn();

    render(
      <ReleaseTaskCompactRow
        task={createTask()}
        onNavigate={onNavigate}
        onToggle={onToggle}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Pitch playlist/ }));
    expect(onNavigate).toHaveBeenCalledWith('task_1');
    expect(onToggle).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Mark "Pitch playlist editors" as complete',
      })
    );
    expect(onToggle).toHaveBeenCalledWith('task_1', true);
  });
});
