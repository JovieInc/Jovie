import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AccountMenuShortcut } from './AccountMenuShortcut';

function keycaps(container: HTMLElement): HTMLElement[] {
  const hint = container.querySelector('[data-account-menu-shortcut]');
  return [...(hint?.children ?? [])] as HTMLElement[];
}

describe('AccountMenuShortcut', () => {
  it('renders one design-system keycap per key, in order', () => {
    const { container } = render(<AccountMenuShortcut keys={['G', 'S']} />);
    const caps = keycaps(container);
    expect(caps.map(cap => cap.textContent)).toEqual(['G', 'S']);
    for (const cap of caps) {
      expect(cap.tagName).toBe('KBD');
      expect(cap).toHaveAttribute('data-slot', 'kbd');
      expect(cap).toHaveAttribute('data-variant', 'default');
      expect(cap).toHaveAttribute('data-size', 'sm');
    }
  });

  it('gives letter chords and modifier chords the same keycap', () => {
    const letters = render(<AccountMenuShortcut keys={['G', 'S']} />);
    const modifiers = render(<AccountMenuShortcut keys={['⌥', '⇧', 'Q']} />);
    const classes = new Set(
      [...keycaps(letters.container), ...keycaps(modifiers.container)].map(
        cap => cap.className
      )
    );
    expect(classes.size).toBe(1);
    expect(keycaps(modifiers.container)).toHaveLength(3);
  });

  it('speaks modifier glyphs by name', async () => {
    const { container } = render(
      <AccountMenuShortcut keys={['⌥', '⇧', 'Q']} />
    );
    expect(screen.getByText('Option')).toHaveClass('sr-only');
    expect(screen.getByText('Shift')).toHaveClass('sr-only');
    // The shift keycap keeps its icon at the compact keycap size.
    expect(
      container.querySelector('[data-kbd-shift-icon]')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders an empty hint for no keys', () => {
    const { container } = render(<AccountMenuShortcut keys={[]} />);
    expect(keycaps(container)).toHaveLength(0);
  });
});
