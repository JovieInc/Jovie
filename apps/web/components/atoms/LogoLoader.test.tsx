import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LogoLoader } from './LogoLoader';

describe('LogoLoader', () => {
  it('announces loading while rendering a decorative animated brand mark', () => {
    render(<LogoLoader size={24} aria-label='Loading profile' />);

    const loader = screen.getByRole('status', { name: 'Loading profile' });
    expect(loader).toHaveAttribute('aria-live', 'polite');

    const mark = loader.querySelector('svg');
    expect(mark).toHaveAttribute('width', '24');
    expect(mark?.parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(mark?.parentElement).toHaveClass('animate-pulse');
  });
});
