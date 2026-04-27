import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ShellLoader } from '../ShellLoader';

describe('ShellLoader', () => {
  it('renders the bloom phase with the mark visible', () => {
    const { container } = render(<ShellLoader phase='bloom' />);
    expect(container.firstChild).toBeInTheDocument();
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute('aria-hidden')).toBe('true');
    // jsdom normalizes rgba(6,7,10,1) → rgb(6, 7, 10).
    expect(root.style.backgroundColor.replaceAll(' ', '')).toContain(
      'rgb(6,7,10)'
    );
  });

  it('renders the reveal phase with the bg fading to transparent', () => {
    const { container } = render(<ShellLoader phase='reveal' />);
    const root = container.firstChild as HTMLElement;
    // jsdom keeps the alpha channel when alpha < 1.
    expect(root.style.backgroundColor.replaceAll(' ', '')).toContain(
      'rgba(6,7,10,0)'
    );
  });

  it('returns null when phase is done', () => {
    const { container } = render(<ShellLoader phase='done' />);
    expect(container.firstChild).toBeNull();
  });

  it('merges custom className with the base classes (preserves core behavior)', () => {
    const { container } = render(
      <ShellLoader phase='bloom' className='my-custom-overlay' />
    );
    const root = container.firstChild as HTMLElement;
    const cls = root.getAttribute('class') ?? '';
    expect(cls).toContain('my-custom-overlay');
    // Base classes must remain — pointer-events-none is core to loader behavior.
    expect(cls).toContain('pointer-events-none');
    expect(cls).toContain('fixed');
  });
});
