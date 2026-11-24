import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';

describe('Button frosted glass variants', () => {
  it('owns frosted glass variants as first-class Button selections', () => {
    render(
      <>
        <Button variant='frosted'>Frosted</Button>
        <Button variant='frosted-ghost'>Frosted ghost</Button>
        <Button variant='frosted-outline'>Frosted outline</Button>
      </>
    );

    const solid = screen.getByRole('button', { name: 'Frosted' });
    expect(solid).toHaveAttribute('data-variant', 'frosted');
    expect(solid.className).toContain('bg-icon-button-frosted');
    expect(solid.className).toContain('backdrop-blur-sm');

    const ghost = screen.getByRole('button', { name: 'Frosted ghost' });
    expect(ghost).toHaveAttribute('data-variant', 'frosted-ghost');
    expect(ghost.className).toContain('backdrop-blur-sm');

    const outline = screen.getByRole('button', { name: 'Frosted outline' });
    expect(outline).toHaveAttribute('data-variant', 'frosted-outline');
    expect(outline.className).toContain('border-subtle');
    expect(outline.className).toContain('backdrop-blur-sm');
  });
});
