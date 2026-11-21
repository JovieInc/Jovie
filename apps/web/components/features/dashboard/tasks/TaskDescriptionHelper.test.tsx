import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TaskDescriptionHelper } from './TaskDescriptionHelper';

const helper = {
  title: 'What to include',
  intro: ['Add a short summary.', 'Add a short summary.'],
  bullets: ['Release date', 'Primary artist'],
  links: [{ href: 'https://example.com/guide', label: 'Read the guide' }],
  footer: 'Edit any time.',
};

describe('TaskDescriptionHelper', () => {
  it('renders the helper copy and stays axe-clean', async () => {
    const { container } = render(
      <TaskDescriptionHelper helper={helper} onBeginEditing={vi.fn()} />
    );

    expect(
      screen.getByRole('heading', { name: 'What to include' })
    ).toBeVisible();
    expect(screen.getAllByText('Add a short summary.')).toHaveLength(2);
    expect(screen.getByText('Release date')).toBeInTheDocument();
    expect(screen.getByText('Edit any time.')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Read the guide' })
    ).toHaveAttribute('target', '_blank');
    await expectNoA11yViolations(container);
  });

  it('begins editing when the helper surface is activated', async () => {
    const user = userEvent.setup();
    const onBeginEditing = vi.fn();
    render(
      <TaskDescriptionHelper
        helper={{ title: 'Describe', intro: [] }}
        onBeginEditing={onBeginEditing}
      />
    );

    await user.click(screen.getByTestId('task-description-helper'));
    expect(onBeginEditing).toHaveBeenCalledOnce();
  });

  it('omits optional sections when they are absent', () => {
    render(
      <TaskDescriptionHelper
        helper={{ title: 'Describe', intro: ['Only intro.'] }}
        onBeginEditing={vi.fn()}
      />
    );

    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
