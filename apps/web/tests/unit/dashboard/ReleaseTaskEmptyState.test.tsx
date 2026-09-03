import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReleaseTaskEmptyState } from '@/components/features/dashboard/release-tasks/ReleaseTaskEmptyState';

describe('ReleaseTaskEmptyState', () => {
  it('preserves the release playbook anatomy inside the canonical card', () => {
    const onSetUp = vi.fn();
    const { container } = render(
      <ReleaseTaskEmptyState onSetUp={onSetUp} isLoading={false} />
    );

    expect(screen.getByRole('heading')).toHaveTextContent(
      'Your Release Playbook'
    );
    expect(
      screen.getByText(
        '20 battle-tested tasks to maximize your release — from DSP pitching to fan notifications.'
      )
    ).toBeVisible();

    const card = screen.getByTestId('release-task-empty-state-card');
    expect(card).toHaveClass(
      'rounded-lg',
      'border',
      'border-(--app-shell-border)',
      'bg-surface-0'
    );
    expect(card).not.toHaveClass('bg-surface-1');
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true'
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Generate Release Plan' })
    );
    expect(onSetUp).toHaveBeenCalledOnce();
  });

  it('keeps the action disabled and updates its label while generating', () => {
    const onSetUp = vi.fn();
    render(<ReleaseTaskEmptyState onSetUp={onSetUp} isLoading />);

    const action = screen.getByRole('button', { name: 'Generating...' });
    expect(action).toBeDisabled();

    fireEvent.click(action);
    expect(onSetUp).not.toHaveBeenCalled();
  });
});
