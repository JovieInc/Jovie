import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DrawerInlineNote } from './DrawerInlineNote';

describe('DrawerInlineNote', () => {
  it('renders the message', async () => {
    const { container } = render(
      <DrawerInlineNote message='Nothing here yet.' />
    );

    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('applies the error tone class when tone is error', async () => {
    const { container } = render(
      <DrawerInlineNote message='Something failed' tone='error' />
    );

    expect(screen.getByText('Something failed')).toHaveClass('text-error');
    await expectNoA11yViolations(container);
  });

  it('wraps a long message instead of clipping it', async () => {
    const message =
      'Links from Spotify, Apple Music, YouTube Music, Tidal, Deezer, Amazon Music and SoundCloud will show here once the catalog sync finishes.';
    const { container } = render(
      <div className='w-80'>
        <DrawerInlineNote message={message} />
      </div>
    );

    const note = screen.getByText(message);
    expect(note.className).not.toMatch(/truncate|line-clamp|whitespace-nowrap/);
    await expectNoA11yViolations(container);
  });

  it('keeps the message in a right-to-left drawer', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <DrawerInlineNote message='لم تتم إضافة أي روابط بعد.' inset='flush' />
      </div>
    );

    expect(screen.getByText('لم تتم إضافة أي روابط بعد.')).toBeInTheDocument();
    await expectNoA11yViolations(container);
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
