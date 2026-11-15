import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { type TaskStatus, TaskStatusIcon } from './TaskStatusIcon';

describe('TaskStatusIcon certificate', () => {
  it.each<[TaskStatus, string]>([
    ['backlog', 'Backlog'],
    ['todo', 'Todo'],
    ['in_progress', 'In progress'],
    ['done', 'Done'],
    ['cancelled', 'Cancelled'],
  ])('labels the %s glyph and stays axe-clean', async (status, label) => {
    const { container } = render(<TaskStatusIcon status={status} />);
    expect(screen.getByLabelText(label)).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/(cyan|emerald)-\d/);
    await expectNoA11yViolations(container);
  });

  it('draws in-progress with the accent token and pulses while an agent runs', async () => {
    const { container } = render(
      <TaskStatusIcon status='in_progress' agentRunning />
    );
    const glyph = screen.getByRole('img', {
      name: 'In progress, agent running',
    });
    expect(glyph).toHaveClass('text-accent', 'anim-calm-breath');
    await expectNoA11yViolations(container);
  });

  it('fills done with the success token', () => {
    render(<TaskStatusIcon status='done' className='me-1' />);
    expect(screen.getByRole('img', { name: 'Done' })).toHaveClass(
      'bg-success/85',
      'me-1'
    );
  });

  it('renders inside a right-to-left row', async () => {
    const { container } = render(
      <div dir='rtl'>
        <TaskStatusIcon status='todo' />
      </div>
    );
    expect(screen.getByLabelText('Todo')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
