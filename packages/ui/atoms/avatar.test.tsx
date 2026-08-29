import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  AVATAR_PERSON_RADIUS_CLASSNAME,
  Avatar,
  AvatarFallback,
  AvatarImage,
  AvatarStatusDot,
  getAvatarSizePx,
  getInitials,
  UserAvatar,
} from './avatar';
import {
  CROPPED_ARTWORK_AVATAR_FIXTURE_TEST_ID,
  CroppedArtworkAvatarFixture,
} from './fixtures/cropped-artwork-avatar';
import {
  NON_CIRCULAR_IDENTITY_AVATAR_FIXTURE_TEST_ID,
  NonCircularIdentityAvatarFixture,
} from './fixtures/non-circular-identity-avatar';

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

  it('keeps person geometry circular even when a square class is passed', () => {
    render(
      <Avatar data-testid='avatar' className='rounded-md'>
        <AvatarFallback>TW</AvatarFallback>
      </Avatar>
    );

    const avatar = screen.getByTestId('avatar');
    expect(avatar).toHaveAttribute('data-shape', 'person');
    expect(avatar).toHaveClass(AVATAR_PERSON_RADIUS_CLASSNAME);
    expect(avatar).toHaveStyle({
      width: `${getAvatarSizePx('md')}px`,
      height: `${getAvatarSizePx('md')}px`,
    });
  });

  it('uses rounded-square geometry for release artwork', () => {
    render(
      <Avatar data-testid='artwork' size='2xl' shape='artwork'>
        <AvatarFallback>ME</AvatarFallback>
      </Avatar>
    );

    const artwork = screen.getByTestId('artwork');
    expect(artwork).toHaveAttribute('data-shape', 'artwork');
    expect(artwork).toHaveClass('rounded-lg');
    expect(artwork).not.toHaveClass('rounded-full');
    expect(artwork).toHaveClass('overflow-hidden');
    expect(screen.getByText('ME')).toHaveClass('rounded-lg', 'text-2xl');
  });

  it('inherits artwork geometry and contain fit in the documented composition', () => {
    render(
      <Avatar size='2xl' shape='artwork'>
        <AvatarImage data-testid='artwork-image' src='/release.png' />
      </Avatar>
    );

    const image = screen.getByTestId('artwork-image');
    expect(image).toHaveClass('rounded-lg', 'object-contain');
    expect(image).not.toHaveClass('rounded-full', 'object-cover');
  });

  it('supports explicit artwork props without allowing a cover crop', () => {
    render(
      <Avatar size='2xl' shape='artwork'>
        <AvatarImage
          data-testid='explicit-artwork-image'
          src='/release.png'
          size='2xl'
          shape='artwork'
          className='rounded-full object-cover'
        />
      </Avatar>
    );

    const image = screen.getByTestId('explicit-artwork-image');
    expect(image).toHaveClass('rounded-lg', 'object-contain');
    expect(image).not.toHaveClass('rounded-full', 'object-cover');
  });

  it('keeps the parent artwork contract when child props conflict', () => {
    render(
      <Avatar size='2xl' shape='artwork'>
        <AvatarImage
          data-testid='conflicting-artwork-image'
          src='/release.png'
          size='md'
          shape='person'
        />
      </Avatar>
    );

    const image = screen.getByTestId('conflicting-artwork-image');
    expect(image).toHaveClass('rounded-lg', 'object-contain');
    expect(image).not.toHaveClass('rounded-full', 'object-cover');
  });

  it('rejects the deliberate-red circular cover crop for artwork', () => {
    render(<CroppedArtworkAvatarFixture />);
    render(
      <Avatar size='2xl' shape='artwork'>
        <AvatarImage
          data-testid='production-artwork-image'
          src='/release.png'
        />
      </Avatar>
    );

    const fixture = screen.getByTestId(CROPPED_ARTWORK_AVATAR_FIXTURE_TEST_ID);
    const fixtureImage = screen.getByTestId(
      `${CROPPED_ARTWORK_AVATAR_FIXTURE_TEST_ID}-image`
    );
    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(fixture).toHaveClass('rounded-full');
    expect(fixtureImage).toHaveClass('rounded-full', 'object-cover');

    const productionImage = screen.getByTestId('production-artwork-image');
    expect(productionImage).toHaveClass('rounded-lg', 'object-contain');
    expect(productionImage).not.toHaveClass('rounded-full', 'object-cover');
  });

  it('rejects the deliberate-red non-circular identity crop', () => {
    render(<NonCircularIdentityAvatarFixture />);
    render(<UserAvatar name='Tim White' />);

    const fixture = screen.getByTestId(
      NON_CIRCULAR_IDENTITY_AVATAR_FIXTURE_TEST_ID
    );
    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(fixture).toHaveClass('rounded-md');
    expect(fixture).not.toHaveClass('rounded-full');

    const identity = screen.getByText('TW');
    expect(identity).toHaveClass('rounded-full');
    expect(identity).not.toHaveClass('rounded-md');

    const atomSource = readFileSync(path.join(__dirname, 'avatar.tsx'), 'utf8');
    expect(atomSource).not.toContain('non-circular-identity-avatar');
  });
});
