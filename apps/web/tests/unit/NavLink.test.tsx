import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NavLink } from '@/components/atoms/NavLink';

describe('NavLink', () => {
  it('renders with default variant', () => {
    render(<NavLink href='/test'>Test Link</NavLink>);

    const link = screen.getByRole('link', { name: 'Test Link' });
    expect(link).toHaveAttribute('href', '/test');
    expect(link).toHaveClass('text-sm');
    expect(link).toHaveClass('text-muted-foreground');
  });

  it('renders with primary variant', () => {
    render(
      <NavLink href='/test' variant='primary'>
        Test Link
      </NavLink>
    );

    const link = screen.getByRole('link', { name: 'Test Link' });
    expect(link).toHaveClass('bg-btn-primary');
    expect(link).toHaveClass('text-btn-primary-foreground');
  });

  it('applies custom className', () => {
    render(
      <NavLink href='/test' className='custom-class'>
        Test Link
      </NavLink>
    );

    const link = screen.getByRole('link', { name: 'Test Link' });
    expect(link).toHaveClass('custom-class');
  });

  it('renders children correctly', () => {
    render(<NavLink href='/test'>Custom Content</NavLink>);

    expect(screen.getByText('Custom Content')).toBeInTheDocument();
  });
});
