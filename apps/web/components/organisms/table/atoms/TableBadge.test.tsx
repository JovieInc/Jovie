import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TableBadge } from './TableBadge';

describe('TableBadge overflow contract', () => {
  it('shows the complete destructive label instead of line-clamping it', () => {
    render(
      <div className='w-28'>
        <TableBadge variant='error'>
          Destructive action requires review
        </TableBadge>
      </div>
    );

    const badge = screen.getByText('Destructive action requires review');
    expect(badge).toHaveClass('max-w-full', 'whitespace-normal', 'break-words');
    expect(badge).not.toHaveClass(
      'line-clamp-1',
      'overflow-hidden',
      'whitespace-nowrap'
    );
  });
});
