import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthUnavailableCard } from '@/features/auth';

const pathname = vi.hoisted(() => ({ value: '/signin' }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.value,
}));

describe('AuthUnavailableCard', () => {
  beforeEach(() => {
    pathname.value = '/signin';
  });

  it('uses compact design-system button sizing for unavailable auth actions', () => {
    render(<AuthUnavailableCard />);

    const action = screen.getByRole('link', { name: 'Go to Homepage' });
    expect(action.className).not.toContain('min-h-[3.75rem]');
    expect(action.className).toContain('min-h-[40px]');

    const heading = screen.getByRole('heading', {
      name: 'Sign in is temporarily unavailable',
    });
    expect(heading.className).not.toContain('clamp(2.9rem');
  });
});
