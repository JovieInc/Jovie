import { fireEvent, render, screen } from '@testing-library/react';
import { Plus } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { ActionPill } from './ActionPill';

describe('ActionPill', () => {
  it('renders the label', () => {
    render(<ActionPill label='New release' />);
    expect(
      screen.getByRole('button', { name: 'New release' })
    ).toBeInTheDocument();
  });

  it('renders the leading icon when provided', () => {
    const { container } = render(
      <ActionPill label='New release' icon={Plus} />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('omits the icon when not provided', () => {
    const { container } = render(<ActionPill label='New release' />);
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('fires onClick when pressed', () => {
    const onClick = vi.fn();
    render(<ActionPill label='Go' onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('defaults type to button', () => {
    render(<ActionPill label='Go' />);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('accepts type=submit for use inside forms', () => {
    render(<ActionPill label='Go' type='submit' />);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });
});
