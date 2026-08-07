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
