import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HeaderNav } from '@/components/organisms/HeaderNav';

// Mock Clerk (MobileNav uses SignedIn/SignedOut)
vi.mock('@clerk/nextjs', () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => null,
  SignedOut: ({ children }: { children: React.ReactNode }) => children,
}));

describe('HeaderNav flyout interactions', () => {
  it('renders primary navigation links', () => {
    render(<HeaderNav />);

    expect(
      screen.getAllByRole('link', { name: 'Pricing' })[0]
    ).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
