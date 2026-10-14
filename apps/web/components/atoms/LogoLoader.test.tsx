import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LogoLoader } from './LogoLoader';

describe('LogoLoader', () => {
  it('announces loading while the living O runs decoratively', () => {
    render(<LogoLoader size={24} aria-label='Loading profile' />);

    const loader = screen.getByRole('status', { name: 'Loading profile' });
    expect(loader).toHaveAttribute('aria-live', 'polite');

    const mark = loader.querySelector('svg');
    expect(mark).toHaveAttribute('height', '24');
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    // the living O, not a pulsing or spinning icon
    expect(mark).toHaveAttribute('data-jo-state', 'loading');
    expect(loader.querySelector('.animate-pulse, .animate-spin')).toBeNull();
  });
});
