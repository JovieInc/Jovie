import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Import the individual atomic components to test them directly
import { LogoLink } from '@/components/atoms/LogoLink';
import { AuthActions } from '@/components/molecules/AuthActions';
import { NavLink } from '@/components/atoms/NavLink';

// Mock Clerk
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    isSignedIn: false,
  }),
}));

describe('Atomic Design Structure', () => {
  describe('Atoms', () => {
    it('LogoLink component works correctly', () => {
      render(<LogoLink />);

      const link = screen.getByRole('link', { name: 'Jovie' });
      expect(link).toHaveAttribute('href', '/');
      expect(link).toHaveClass('flex', 'items-center', 'space-x-2');
    });

    it('NavLink component works correctly', () => {
      render(<NavLink href='/test'>Test Link</NavLink>);

      const link = screen.getByRole('link', { name: 'Test Link' });
      expect(link).toHaveAttribute('href', '/test');
    });
  });

  describe('Molecules', () => {
    it('AuthActions component works correctly', () => {
      render(<AuthActions />);

      expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: /sign up/i })
      ).toBeInTheDocument();

      // Check that it's properly structured
      const container = screen.getByRole('link', {
        name: 'Log in',
      }).parentElement;
      expect(container).toHaveClass('flex', 'items-center', 'gap-1');
    });
  });

  describe('Atomic Design Principles', () => {
    it('components follow atomic design structure', () => {
      // Test that atoms can be composed into molecules
      render(
        <div className='flex items-center space-x-4'>
          <LogoLink />
          <AuthActions />
        </div>
      );

      // Should have logo and log in/sign up links
      expect(screen.getByRole('link', { name: 'Jovie' })).toHaveAttribute(
        'href',
        '/'
      ); // Logo link
      expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: /sign up/i })
      ).toBeInTheDocument();
    });
  });
});
