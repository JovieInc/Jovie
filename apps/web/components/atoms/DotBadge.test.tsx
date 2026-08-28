import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DotBadge } from './DotBadge';

const errorVariant = {
  className: 'border-error bg-error-subtle text-error',
  dotClassName: 'bg-error',
};

describe('DotBadge overflow contract', () => {
  it('allows a constrained destructive label to wrap without clipping', () => {
    render(
      <div className='w-28'>
        <DotBadge
          label='Destructive action requires review'
          variant={errorVariant}
        />
      </div>
    );

    const badge = screen
      .getByText('Destructive action requires review')
      .closest('span');

    expect(badge).toHaveClass('max-w-full', 'whitespace-normal', 'break-words');
    expect(badge).not.toHaveClass(
      'whitespace-nowrap',
      'overflow-hidden',
      'line-clamp-1'
    );
    expect(badge?.className).toContain('rounded-(--system-b-radius-pill)');
  });

  it('uses semantic error tokens without raw blue hover styling', () => {
    render(<DotBadge label='Blocked' variant={errorVariant} />);

    const badge = screen.getByText('Blocked').closest('span');
    expect(badge).toHaveClass('border-error', 'bg-error-subtle', 'text-error');
    expect(badge?.className).not.toMatch(/(?:hover:)?(?:bg|text|border)-blue-/);
  });
});
