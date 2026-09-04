import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CollapsibleSectionHeading } from './CollapsibleSectionHeading';

describe('CollapsibleSectionHeading', () => {
  it('exposes expanded state and keeps the toggle action on the heading', () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <CollapsibleSectionHeading
        isOpen
        onToggle={onToggle}
        aria-controls='details-panel'
      >
        Details
      </CollapsibleSectionHeading>
    );

    const heading = screen.getByRole('button', { name: 'Details' });
    expect(heading).toHaveAttribute('aria-expanded', 'true');
    expect(heading).toHaveAttribute('aria-controls', 'details-panel');

    fireEvent.click(heading);
    expect(onToggle).toHaveBeenCalledOnce();

    rerender(
      <CollapsibleSectionHeading
        isOpen={false}
        onToggle={onToggle}
        aria-controls='details-panel'
      >
        Details
      </CollapsibleSectionHeading>
    );
    expect(screen.getByRole('button', { name: 'Details' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });
});
