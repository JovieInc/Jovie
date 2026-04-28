import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PickerAction } from './PickerAction';

describe('PickerAction', () => {
  it('renders the label', () => {
    render(<PickerAction label='Sort by date' onClick={() => undefined} />);
    expect(screen.getByText('Sort by date')).toBeInTheDocument();
  });

  it('fires onClick when clicked', () => {
    const onClick = vi.fn();
    render(<PickerAction label='Sort' onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('shows the active dot when active is true', () => {
    const { container } = render(
      <PickerAction label='Sort' onClick={() => undefined} active />
    );
    expect(container.querySelector('span[aria-hidden="true"]')).not.toBeNull();
  });

  it('reports aria-pressed reflecting the active state', () => {
    render(<PickerAction label='Sort' onClick={() => undefined} active />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('reports aria-pressed=false when not active', () => {
    render(<PickerAction label='Sort' onClick={() => undefined} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });
});
