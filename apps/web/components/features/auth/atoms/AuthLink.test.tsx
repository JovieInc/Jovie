import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthLink } from './AuthLink';

describe('AuthLink', () => {
  it('renders an underlined link with the primary text token', () => {
    render(<AuthLink href='/signin'>Sign in</AuthLink>);
    const link = screen.getByRole('link', { name: 'Sign in' });
    expect(link).toHaveAttribute('href', '/signin');
    expect(link).toHaveClass('text-primary-token', 'underline');
    expect(link.className).not.toContain('--color-bg-surface-2');
  });
});
