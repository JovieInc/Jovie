import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  Avatar,
  AvatarFallback,
  AvatarStatusDot,
  getInitials,
  UserAvatar,
} from './avatar';

describe('Avatar', () => {
  it('uses System B ring tokens for stacked avatars', () => {
    render(<Avatar data-testid='avatar' ring />);

    const avatar = screen.getByTestId('avatar');
    expect(avatar.className).toContain('ring-2');
    expect(avatar.className).toContain('ring-surface-page');
    expect(avatar).toHaveAttribute('data-ring', 'true');
    expect(avatar).toHaveAttribute('data-size', 'md');
  });

  it('keeps status adornments outside the clipped media circle', () => {
    render(
      <Avatar data-testid='avatar'>
        <AvatarFallback>TW</AvatarFallback>
        <AvatarStatusDot status='online' />
      </Avatar>
    );

    expect(screen.getByTestId('avatar')).toHaveClass('overflow-visible');
    expect(screen.getByLabelText('online status')).toHaveAttribute(
      'data-status',
      'online'
    );
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

  it('handles empty, single-word, and multi-word initial sources', () => {
    expect(getInitials('')).toBe('?');
    expect(getInitials('tim')).toBe('T');
    expect(getInitials('Tim van White')).toBe('TW');
  });

  it('uses a neutral accessible fallback when no identity is available', () => {
    render(<UserAvatar status='offline' />);

    expect(screen.getByText('?')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'offline status' })).toBeVisible();
  });

  it('renders identity images with a circular crop and descriptive alt text', () => {
    render(<UserAvatar name='Tim White' src='/tim-white.png' />);

    const image = screen.getByRole('img', { name: 'Tim White' });
    expect(image).toHaveAttribute('src', '/tim-white.png');
    expect(image).toHaveClass('rounded-full', 'object-cover');
  });
});
