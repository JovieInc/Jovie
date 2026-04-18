import { fireEvent, render, screen } from '@testing-library/react';
import type { HTMLAttributes, ImgHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PHONE_SHOWCASE_MODES } from '@/features/home/phone-showcase-modes';
import { PhoneShowcase } from '@/features/home/phone-showcase-primitives';

vi.mock('next/image', () => ({
  default: ({
    alt,
    blurDataURL: _blurDataURL,
    priority: _priority,
    unoptimized: _unoptimized,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & { readonly alt: string }) => (
    <img alt={alt} {...props} />
  ),
}));

vi.mock('motion/react', () => ({
  motion: {
    div: ({
      children,
      animate: _animate,
      initial: _initial,
      transition: _transition,
      ...props
    }: HTMLAttributes<HTMLDivElement> & {
      readonly children?: ReactNode;
    }) => <div {...props}>{children}</div>,
  },
}));

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

describe('PhoneShowcase', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation(() => ({
        matches: false,
        media: '(prefers-reduced-motion: reduce)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
  });

  it('updates aria-pressed when a tab is clicked', () => {
    render(<PhoneShowcase modes={PHONE_SHOWCASE_MODES} autoRotate={false} />);

    const profileButton = screen.getByRole('button', { name: '/profile' });
    const tourButton = screen.getByRole('button', { name: '/tour' });

    expect(profileButton).toHaveAttribute('aria-pressed', 'true');
    expect(tourButton).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(tourButton);

    expect(profileButton).toHaveAttribute('aria-pressed', 'false');
    expect(tourButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('respects a controlled activeIndex', () => {
    render(
      <PhoneShowcase
        activeIndex={2}
        modes={PHONE_SHOWCASE_MODES}
        autoRotate={false}
      />
    );

    expect(screen.getByRole('button', { name: '/pay' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('renders safely when measurements are zero in jsdom', () => {
    render(<PhoneShowcase modes={PHONE_SHOWCASE_MODES} autoRotate={false} />);

    expect(
      screen.getByRole('navigation', { name: 'Phone mode tabs' })
    ).toBeInTheDocument();
  });
});
