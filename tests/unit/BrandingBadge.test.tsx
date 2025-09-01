import { useUser } from '@clerk/nextjs';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BrandingBadge from '@/components/BrandingBadge';

// Mock Clerk's useUser hook
vi.mock('@clerk/nextjs', () => ({
  useUser: vi.fn(),
}));

describe('BrandingBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows branding for free plan users', () => {
    (useUser as any).mockReturnValue({
      user: {
        publicMetadata: { plan: 'free' },
      },
      isLoaded: true,
    });

    render(<BrandingBadge />);

    expect(screen.getByText('Made with Jovie')).toBeInTheDocument();
  });

  it('hides branding for pro plan users', () => {
    (useUser as any).mockReturnValue({
      user: {
        publicMetadata: { plan: 'pro' },
      },
      isLoaded: true,
    });

    const { container } = render(<BrandingBadge />);

    expect(container.firstChild).toBeNull();
  });

  it('shows branding for users without plan metadata (defaults to free)', () => {
    (useUser as any).mockReturnValue({
      user: {
        publicMetadata: {},
      },
      isLoaded: true,
    });

    render(<BrandingBadge />);

    expect(screen.getByText('Made with Jovie')).toBeInTheDocument();
  });

  it('shows placeholder while loading', () => {
    (useUser as any).mockReturnValue({
      user: null,
      isLoaded: false,
    });

    const { container } = render(<BrandingBadge />);

    expect(container.firstChild).toHaveClass('skeleton');
  });

  it('shows branding for unauthenticated users', () => {
    (useUser as any).mockReturnValue({
      user: null,
      isLoaded: true,
    });

    render(<BrandingBadge />);

    expect(screen.getByText('Made with Jovie')).toBeInTheDocument();
  });
});
