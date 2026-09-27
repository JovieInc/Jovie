import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TasksRouteSkeleton } from './TasksRouteSkeleton';

describe('TasksRouteSkeleton', () => {
  it('renders the loading toolbar and row skeletons', () => {
    render(<TasksRouteSkeleton />);

    expect(screen.getByLabelText('Loading Tasks')).toBeInTheDocument();
  });

  it('uses the single unified header-height token (founder lock 2026-09-25)', () => {
    const { container } = render(<TasksRouteSkeleton />);

    const toolbar = container.querySelector(
      '.h-\\(--app-shell-header-height\\)'
    );
    expect(toolbar).toBeTruthy();
    expect(
      container.querySelector('[class*="--app-shell-header-height-compact"]')
    ).toBeNull();
  });
});
