import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrandingBadge } from '@/components/organisms/BrandingBadge';

const mockUsePlanGate = vi.hoisted(() => vi.fn());

vi.mock('@/lib/queries/usePlanGate', () => ({
  usePlanGate: mockUsePlanGate,
}));

describe('BrandingBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows branding for free plan users', () => {
    mockUsePlanGate.mockReturnValue({
      canRemoveBranding: false,
      isLoading: false,
    });
    render(<BrandingBadge />);
    expect(screen.getByText('Made with Jovie')).toBeInTheDocument();
  });

  it('hides branding for pro plan users', () => {
    mockUsePlanGate.mockReturnValue({
      canRemoveBranding: true,
      isLoading: false,
    });
    const { container } = render(<BrandingBadge />);
    expect(container.firstChild).toBeNull();
  });

  it('shows branding for users without plan metadata (defaults to free)', () => {
    mockUsePlanGate.mockReturnValue({
      canRemoveBranding: false,
      isLoading: false,
    });
    render(<BrandingBadge />);
    expect(screen.getByText('Made with Jovie')).toBeInTheDocument();
  });

  it('shows placeholder while loading', () => {
    mockUsePlanGate.mockReturnValue({
      canRemoveBranding: false,
      isLoading: true,
    });
    const { container } = render(<BrandingBadge />);
    expect(container.firstChild).toHaveClass('skeleton');
  });

  it('shows branding for unauthenticated users', () => {
    mockUsePlanGate.mockReturnValue({
      canRemoveBranding: false,
      isLoading: false,
    });
    render(<BrandingBadge />);
    expect(screen.getByText('Made with Jovie')).toBeInTheDocument();
  });
});
