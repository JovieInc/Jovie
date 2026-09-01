import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  MODE_TAB_LABELS,
  MODES,
  PhoneShowcase,
} from './phone-showcase-primitives';

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children }: { readonly children?: ReactNode }) => (
      <div>{children}</div>
    ),
  },
}));

vi.mock('@/components/atoms/ArtistName', () => ({
  ArtistName: ({ name }: { readonly name: string }) => <p>{name}</p>,
}));

vi.mock('@/components/molecules/Avatar', () => ({
  Avatar: ({ alt, src }: { readonly alt: string; readonly src: string }) => (
    <img alt={alt} src={src} />
  ),
}));

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

vi.mock('./PhoneFrame', () => ({
  PhoneFrame: ({ children }: { readonly children: ReactNode }) => (
    <div data-testid='phone-frame'>{children}</div>
  ),
}));

describe('phone showcase primitives', () => {
  it('renders phone tabs and switches the active mode on click', () => {
    render(<PhoneShowcase modes={MODES} autoRotate={false} />);

    expect(screen.getByTestId('phone-frame')).toBeInTheDocument();
    expect(screen.getByText(MODES[0].outcome)).toBeInTheDocument();
    const profileTab = screen.getByRole('button', {
      name: MODE_TAB_LABELS.profile,
    });
    const tourTab = screen.getByRole('button', {
      name: MODE_TAB_LABELS.tour,
    });

    expect(profileTab).toHaveAttribute('aria-pressed', 'true');
    expect(tourTab).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(tourTab);

    expect(profileTab).toHaveAttribute('aria-pressed', 'false');
    expect(tourTab).toHaveAttribute('aria-pressed', 'true');
  });
});
