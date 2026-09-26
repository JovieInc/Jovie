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

  it('renders through the canonical Link primitive', () => {
    render(<NavLink href='/test'>Canonical</NavLink>);

    const link = screen.getByRole('link', { name: 'Canonical' });
    expect(link).toHaveAttribute('data-variant', 'link');
    expect(link).toHaveAttribute('data-state', 'idle');
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

  it('offsets the focus ring against the defined base surface token', () => {
    render(
      <>
        <NavLink href='/default'>Default</NavLink>
        <NavLink href='/primary' variant='primary'>
          Primary
        </NavLink>
      </>
    );

    for (const name of ['Default', 'Primary']) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveClass('focus-visible:ring-offset-base');
      expect(link).not.toHaveClass('focus-visible:ring-offset-background');
    }
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
