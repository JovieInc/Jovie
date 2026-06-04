import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Avatar, AvatarFallback, AvatarStatusDot, UserAvatar } from './avatar';

describe('Avatar', () => {
  it('uses System B ring tokens for stacked avatars', () => {
    render(<Avatar data-testid='avatar' ring />);

    const avatar = screen.getByTestId('avatar');
    expect(avatar.className).toContain('ring-2');
    expect(avatar.className).toContain('ring-surface-page');
  });

  it('uses named System B fallback surface and type scale', () => {
    render(
      <Avatar>
        <AvatarFallback size='md'>TW</AvatarFallback>
      </Avatar>
    );

    const fallback = screen.getByText('TW');
    expect(fallback.className).toContain('bg-surface-2');
    expect(fallback.className).toContain('text-secondary-token');
    expect(fallback.className).toContain('text-2xs');
  });

  it('uses semantic status tokens', () => {
    render(<AvatarStatusDot status='online' />);

    const status = screen.getByText('online').parentElement;
    expect(status?.className).toContain('bg-success');
    expect(status?.className).toContain('ring-surface-page');
  });

  it('derives initials for user avatars', () => {
    render(<UserAvatar name='Tim White' />);

    expect(screen.getByText('TW')).toBeInTheDocument();
  });
});
