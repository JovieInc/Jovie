import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DrawerEntityAvatar } from './DrawerEntityAvatar';

describe('DrawerEntityAvatar', () => {
  it('keeps a concentric 56px frame around a flat 48px media thumb', () => {
    render(<DrawerEntityAvatar name='Alex Rivera' testId='entity-avatar' />);

    const frame = screen.getByTestId('entity-avatar');
    const media = frame.firstElementChild;

    expect(frame).toHaveAttribute('data-entity-avatar');
    expect(frame).toHaveClass(
      'size-14',
      'p-1',
      'rounded-[calc(var(--radius-lg)+var(--space-1))]',
      'ring-1',
      'shadow-none'
    );
    expect(media).toHaveClass(
      'size-12',
      'rounded-lg',
      'outline-(--color-border-subtle)',
      'shadow-none'
    );
    expect(frame).toHaveTextContent('AR');
  });

  it('falls back to initials when the image cannot load', () => {
    const { container } = render(
      <DrawerEntityAvatar
        name='Jordan Reyes'
        src='https://www.gravatar.com/avatar/missing'
        testId='entity-avatar'
      />
    );

    const image = container.querySelector('img');
    expect(image).toBeInTheDocument();
    fireEvent.error(image as HTMLImageElement);
    expect(screen.getByTestId('entity-avatar')).toHaveTextContent('JR');
  });
});
