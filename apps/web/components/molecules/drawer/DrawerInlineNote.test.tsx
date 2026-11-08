import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DrawerInlineNote } from './DrawerInlineNote';

describe('DrawerInlineNote', () => {
  it('renders the message', () => {
    render(<DrawerInlineNote message='Nothing here yet.' />);

    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
  });

  it('applies the error tone class when tone is error', () => {
    render(<DrawerInlineNote message='Something failed' tone='error' />);

    expect(screen.getByText('Something failed')).toHaveClass('text-error');
  });

  it('forwards testId to the rendered element', () => {
    render(
      <DrawerInlineNote message='Nothing here yet.' testId='drawer-note' />
    );

    expect(screen.getByTestId('drawer-note')).toHaveTextContent(
      'Nothing here yet.'
    );
  });
});

describe('DrawerInlineNote inset (JOV-8873)', () => {
  it('keeps the inset on an inner layout box and supports a flush dense variant', () => {
    const { rerender } = render(
      <DrawerInlineNote message='Default note' testId='note' />
    );
    const inner = screen.getByText('Default note').parentElement;
    expect(inner).toHaveClass('min-h-22', 'px-3');
    expect(screen.getByTestId('note')).not.toHaveClass('min-h-22');

    rerender(
      <DrawerInlineNote message='Flush note' inset='flush' testId='note' />
    );
    expect(screen.getByText('Flush note').parentElement).toHaveClass(
      'min-h-12',
      'px-0'
    );
  });
});
