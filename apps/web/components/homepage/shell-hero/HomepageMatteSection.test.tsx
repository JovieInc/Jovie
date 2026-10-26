import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startMatteField } from '@/components/marketing/motion/matte-field-gl';
import { HomepageMatteSection } from './HomepageMatteSection';

vi.mock('@/components/marketing/motion/matte-field-gl', () => ({
  startMatteField: vi.fn(() => null),
}));

function stubMatchMedia(reduced: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('reduce') && reduced,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('HomepageMatteSection', () => {
  it('renders children over a decorative canvas poster', () => {
    stubMatchMedia(true);
    render(
      <HomepageMatteSection>
        <p>below the hero</p>
      </HomepageMatteSection>
    );
    expect(screen.getByText('below the hero')).toBeInTheDocument();
    const root = screen.getByTestId('homepage-matte-section');
    expect(root.querySelector('.shell-matte__field')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    expect(root).toHaveAttribute('data-live', 'false');
  });

  it('never starts the GL field under reduced motion', async () => {
    stubMatchMedia(true);
    vi.stubGlobal('WebGL2RenderingContext', function WebGL2() {});
    render(<HomepageMatteSection>x</HomepageMatteSection>);
    await new Promise(resolve => setTimeout(resolve, 700));
    expect(startMatteField).not.toHaveBeenCalled();
  });

  it('does not start the GL field synchronously on mount (after idle only)', () => {
    stubMatchMedia(false);
    vi.stubGlobal('WebGL2RenderingContext', function WebGL2() {});
    vi.stubGlobal(
      'requestIdleCallback',
      vi.fn(() => 1)
    );
    vi.stubGlobal('cancelIdleCallback', vi.fn());
    render(<HomepageMatteSection>x</HomepageMatteSection>);
    expect(startMatteField).not.toHaveBeenCalled();
    expect(globalThis.requestIdleCallback).toHaveBeenCalledTimes(1);
  });
});
