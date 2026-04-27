import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ShellLoader } from '../ShellLoader';

describe('ShellLoader', () => {
  it('renders the bloom phase with the mark visible', () => {
    const { container } = render(<ShellLoader phase='bloom' />);
    expect(container.firstChild).toBeInTheDocument();
    // Bloom phase: opaque bg, mark at full opacity (transition onto stage).
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute('aria-hidden')).toBe('true');
    // Note: jsdom normalizes rgba(6,7,10,1) → rgb(6, 7, 10).
    expect(root.style.background.replaceAll(' ', '')).toContain('rgb(6,7,10)');
  });

  it('renders the reveal phase with the bg fading to transparent', () => {
    const { container } = render(<ShellLoader phase='reveal' />);
    const root = container.firstChild as HTMLElement;
    // jsdom keeps the alpha channel when alpha < 1.
    expect(root.style.background.replaceAll(' ', '')).toContain(
      'rgba(6,7,10,0)'
    );
  });

  it('returns null when phase is done', () => {
    const { container } = render(<ShellLoader phase='done' />);
    expect(container.firstChild).toBeNull();
  });

  it('accepts a custom className override', () => {
    const { container } = render(
      <ShellLoader phase='bloom' className='my-custom-overlay' />
    );
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute('class')).toBe('my-custom-overlay');
  });
});
