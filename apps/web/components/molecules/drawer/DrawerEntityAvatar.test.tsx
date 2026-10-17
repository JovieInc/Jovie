import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DrawerEntityAvatar } from './DrawerEntityAvatar';

describe('DrawerEntityAvatar', () => {
  it('uses a circular canonical 56px person thumbnail', () => {
    render(<DrawerEntityAvatar name='Alex Rivera' testId='entity-avatar' />);
    const frame = screen.getByTestId('entity-avatar');
    expect(frame).toHaveAttribute(
      'data-entity-header-thumbnail-variant',
      'person'
    );
    expect(frame).toHaveClass('rounded-full');
    expect(frame).toHaveStyle({ width: '56px', height: '56px' });
    expect(frame).toHaveTextContent('AR');
    expect(
      screen.getByRole('img', { name: 'Alex Rivera' })
    ).toBeInTheDocument();
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
