import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrandingBadge } from '@/components/organisms/BrandingBadge';
import * as useClerkSafe from '@/hooks/useClerkSafe';

// Mock the useUserSafe hook
vi.mock('@/hooks/useClerkSafe', () => ({
  useUserSafe: vi.fn(),
}));

const mockUseUserSafe = useClerkSafe.useUserSafe as ReturnType<typeof vi.fn>;

describe('BrandingBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows branding for free plan users', () => {
    mockUseUserSafe.mockReturnValue({
      user: {
        publicMetadata: { plan: 'free' },
      },
      isLoaded: true,
      isSignedIn: true,
    });

    render(<BrandingBadge />);

    expect(screen.getByText('Made with Jovie')).toBeInTheDocument();
  });

  it('hides branding for pro plan users', () => {
    mockUseUserSafe.mockReturnValue({
      user: {
        publicMetadata: { plan: 'pro' },
      },
      isLoaded: true,
      isSignedIn: true,
    });

    const { container } = render(<BrandingBadge />);

    expect(container.firstChild).toBeNull();
  });

  it('shows branding for users without plan metadata (defaults to free)', () => {
    mockUseUserSafe.mockReturnValue({
      user: {
        publicMetadata: {},
      },
      isLoaded: true,
      isSignedIn: true,
    });

    render(<BrandingBadge />);

    expect(screen.getByText('Made with Jovie')).toBeInTheDocument();
  });

  it('shows placeholder while loading', () => {
    mockUseUserSafe.mockReturnValue({
      user: null,
      isLoaded: false,
      isSignedIn: false,
    });

    const { container } = render(<BrandingBadge />);

    expect(container.firstChild).toHaveClass('skeleton');
  });

  it('shows branding for unauthenticated users', () => {
    mockUseUserSafe.mockReturnValue({
      user: null,
      isLoaded: true,
      isSignedIn: false,
    });

    render(<BrandingBadge />);

    expect(screen.getByText('Made with Jovie')).toBeInTheDocument();
  });
});
