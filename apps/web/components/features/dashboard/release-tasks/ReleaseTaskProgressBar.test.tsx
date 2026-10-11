import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReleaseTaskProgressBar } from './ReleaseTaskProgressBar';

describe('ReleaseTaskProgressBar', () => {
  it('renders the overdue count with the error token, not raw red-* (JOV-6773)', () => {
    render(<ReleaseTaskProgressBar done={2} total={5} overdueCount={1} />);

    const overdue = screen.getByText('· 1 overdue');
    expect(overdue.className).toContain('text-error');
    expect(overdue.className).not.toMatch(/\bred-\d/);
  });

  it('does not render an overdue count when there is none', () => {
    render(<ReleaseTaskProgressBar done={2} total={5} />);

    expect(screen.queryByText(/overdue/)).toBeNull();
  });

  it('renders nothing when there are no tasks', () => {
    const { container } = render(<ReleaseTaskProgressBar done={0} total={0} />);

    expect(container).toBeEmptyDOMElement();
  });
});
