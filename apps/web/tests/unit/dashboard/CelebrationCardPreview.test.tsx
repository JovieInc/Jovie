import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CelebrationCardPreview } from '@/components/features/dashboard/molecules/CelebrationCardPreview';

// Mock analytics
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

describe('CelebrationCardPreview', () => {
  it('renders Download button', () => {
    render(<CelebrationCardPreview username='testartist' />);
    expect(screen.getByText('Download')).toBeDefined();
  });

  it('renders Share button when navigator.share is available', () => {
    // navigator.share is defined in the test environment
    Object.defineProperty(navigator, 'share', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });

    render(<CelebrationCardPreview username='testartist' />);
    expect(screen.getByText('Share')).toBeDefined();
  });

  it('does not render Share button when navigator.share is unavailable', () => {
    Object.defineProperty(navigator, 'share', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    render(<CelebrationCardPreview username='testartist' />);
    expect(screen.queryByText('Share')).toBeNull();
  });

  it('renders size picker with both options', () => {
    render(<CelebrationCardPreview username='testartist' />);
    expect(screen.getByText('Square (1080×1080)')).toBeDefined();
    expect(screen.getByText('Story (1080×1920)')).toBeDefined();
  });

  it('renders card preview image', () => {
    render(<CelebrationCardPreview username='testartist' />);
    const img = screen.getByAltText('Your shareable profile card');
    expect(img).toBeDefined();
    expect(img.getAttribute('src')).toContain(
      '/api/celebration-card/testartist'
    );
  });
});
