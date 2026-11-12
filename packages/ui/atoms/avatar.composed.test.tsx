import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  AVATAR_SIZE_NAMES,
  Avatar,
  AvatarFallback,
  AvatarImage,
  AvatarStatusDot,
} from './avatar';
import { AVATAR_SIZE_MAP } from './avatar-contract';

function ComposedAvatar({ src = '/tim-white.png' }: { readonly src?: string }) {
  return (
    <Avatar data-testid='avatar'>
      <AvatarImage src={src} alt='Tim White' data-testid='avatar-image' />
      <AvatarFallback data-testid='avatar-fallback'>TW</AvatarFallback>
    </Avatar>
  );
}

describe('Avatar composed image and fallback', () => {
  it('shows the fallback and keeps the image out of view while it loads', () => {
    render(<ComposedAvatar />);

    expect(screen.getByTestId('avatar-fallback')).toHaveTextContent('TW');
    const image = screen.getByTestId('avatar-image');
    expect(image).toHaveClass('absolute', 'inset-0', 'opacity-0');
    expect(image).not.toHaveAttribute('hidden');
  });

  it('shows the fallback instead of a broken image when the image fails', () => {
    render(<ComposedAvatar />);

    // Deliberate-red: before the fix both rendered and the broken image showed.
    fireEvent.error(screen.getByTestId('avatar-image'));

    expect(screen.getByTestId('avatar-image')).toHaveAttribute('hidden');
    expect(screen.getByTestId('avatar-fallback')).toBeInTheDocument();
  });

  it('removes the fallback once the image loads', () => {
    render(<ComposedAvatar />);

    fireEvent.load(screen.getByTestId('avatar-image'));

    const image = screen.getByTestId('avatar-image');
    expect(image).not.toHaveClass('opacity-0');
    expect(image).not.toHaveAttribute('hidden');
    expect(screen.queryByTestId('avatar-fallback')).not.toBeInTheDocument();
  });

  it('starts loading again when the image source changes after an error', () => {
    const { rerender } = render(<ComposedAvatar />);
    fireEvent.error(screen.getByTestId('avatar-image'));

    rerender(<ComposedAvatar src='/tim-white-2.png' />);

    const image = screen.getByTestId('avatar-image');
    expect(image).not.toHaveAttribute('hidden');
    expect(image).toHaveClass('opacity-0');
    fireEvent.load(image);
    expect(screen.queryByTestId('avatar-fallback')).not.toBeInTheDocument();
  });

  it('calls caller load and error handlers', () => {
    const events: string[] = [];
    render(
      <Avatar>
        <AvatarImage
          src='/tim-white.png'
          alt='Tim White'
          onLoad={() => events.push('load')}
          onError={() => events.push('error')}
        />
      </Avatar>
    );
    const image = screen.getByRole('img', { name: 'Tim White' });
    fireEvent.error(image);
    fireEvent.load(image);
    expect(events).toEqual(['error', 'load']);
  });

  it('leaves a lone image visible, with no fallback to swap to', () => {
    render(
      <Avatar>
        <AvatarImage src='/tim-white.png' alt='Tim White' />
      </Avatar>
    );
    const image = screen.getByRole('img', { name: 'Tim White' });
    expect(image).not.toHaveClass('opacity-0');
    fireEvent.error(image);
    expect(image).not.toHaveAttribute('hidden');
  });
});

describe('Avatar status dot direction', () => {
  it('anchors the status dot to the inline end at every size', () => {
    for (const size of AVATAR_SIZE_NAMES) {
      expect(AVATAR_SIZE_MAP[size].dotOffset).toMatch(/-end-/);
      expect(AVATAR_SIZE_MAP[size].dotOffset).not.toMatch(/-right-/);
    }
  });

  it('renders the inline-end offset on the dot', () => {
    render(
      <div dir='rtl'>
        <Avatar size='lg'>
          <AvatarFallback>ل</AvatarFallback>
          <AvatarStatusDot status='away' />
        </Avatar>
      </div>
    );
    const dot = screen.getByLabelText('away status');
    expect(dot.className).toContain('-end-');
    expect(dot.className).not.toContain('-right-');
  });
});
