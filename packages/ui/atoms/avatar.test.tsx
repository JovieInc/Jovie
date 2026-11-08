import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '../test-utils/a11y';

import {
  AVATAR_PERSON_RADIUS_CLASSNAME,
  AVATAR_SIZE_NAMES,
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

  it('keeps emoji, CJK, and combining-mark initials whole', () => {
    expect(getInitials('🎵 Tim White')).toBe('🎵W');
    expect(getInitials('田中太郎')).toBe('田');
    expect(getInitials('e\u0301mile zola')).toBe('E\u0301Z');
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

  it.each(AVATAR_SIZE_NAMES)(
    'replaces a failed %s portrait with named initials in the same frame',
    size => {
      render(
        <UserAvatar
          name='Tim White'
          src='/broken-portrait.png'
          size={size}
          ring
          status='away'
        />
      );

      const image = screen.getByRole('img', { name: 'Tim White' });
      const frame = image.parentElement;
      const presence = screen.getByRole('img', { name: 'away status' });
      expect(screen.queryByText('TW')).not.toBeInTheDocument();
      fireEvent.error(image);

      const fallback = screen.getByRole('img', { name: 'Tim White' });
      expect(fallback).toHaveTextContent('TW');
      expect(image).not.toBeInTheDocument();
      expect(fallback.parentElement).toBe(frame);
      expect(frame).toHaveClass('align-middle');
      expect(frame).toHaveStyle({
        width: `${getAvatarSizePx(size)}px`,
        height: `${getAvatarSizePx(size)}px`,
      });
      expect(frame).toHaveAttribute('data-ring', 'true');
      expect(fallback).toHaveClass('rounded-full', 'bg-surface-2');
      expect(screen.getByRole('img', { name: 'away status' })).toBe(presence);
    }
  );

  it('uses a named neutral fallback when an unidentified portrait fails', () => {
    render(<UserAvatar src='/broken-portrait.png' />);

    fireEvent.error(screen.getByRole('img', { name: 'Avatar' }));

    expect(screen.getByRole('img', { name: 'Avatar' })).toHaveTextContent('?');
  });

  it('retries a replacement portrait and can recover a previously failed URL', () => {
    const { rerender } = render(
      <UserAvatar name='Tim White' src='/first.png' />
    );
    fireEvent.error(screen.getByRole('img', { name: 'Tim White' }));
    expect(screen.getByText('TW')).toBeVisible();

    rerender(<UserAvatar name='Tim White' src='/replacement.png' />);
    const replacement = screen.getByRole('img', { name: 'Tim White' });
    expect(replacement).toHaveAttribute('src', '/replacement.png');
    expect(screen.queryByText('TW')).not.toBeInTheDocument();
    fireEvent.load(replacement);

    rerender(<UserAvatar name='Tim White' src='/first.png' />);
    const retried = screen.getByRole('img', { name: 'Tim White' });
    expect(retried).toHaveAttribute('src', '/first.png');
    fireEvent.error(retried);
    expect(screen.getByRole('img', { name: 'Tim White' })).toHaveTextContent(
      'TW'
    );

    rerender(<UserAvatar name='Alex Chen' />);
    expect(screen.getByRole('img', { name: 'Alex Chen' })).toHaveTextContent(
      'AC'
    );
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

  it('keeps the context-backed Avatar primitive behind a client boundary', () => {
    const atomSource = readFileSync(path.join(__dirname, 'avatar.tsx'), 'utf8');

    expect(atomSource.startsWith("'use client';")).toBe(true);
    expect(atomSource).toContain('React.createContext');
  });
});

describe('AvatarImage layout stability', () => {
  it.each(AVATAR_SIZE_NAMES)(
    'reserves the %s frame with intrinsic width and height',
    size => {
      render(
        <Avatar size={size}>
          <AvatarImage src='/tim-white.png' alt='Tim White' />
        </Avatar>
      );

      const image = screen.getByRole('img', { name: 'Tim White' });
      const px = String(getAvatarSizePx(size));
      expect(image).toHaveAttribute('width', px);
      expect(image).toHaveAttribute('height', px);
      expect(image).toHaveClass('h-full', 'w-full', 'rounded-full');
    }
  );

  it('uses the explicit size prop outside an Avatar root', () => {
    render(<AvatarImage src='/cover.png' alt='Cover' size='xl' />);

    const image = screen.getByRole('img', { name: 'Cover' });
    expect(image).toHaveAttribute('width', String(getAvatarSizePx('xl')));
    expect(image).toHaveAttribute('height', String(getAvatarSizePx('xl')));
  });

  it('lets a caller override the intrinsic dimensions', () => {
    render(
      <Avatar size='md'>
        <AvatarImage src='/tim-white.png' alt='Tim White' width={120} />
      </Avatar>
    );

    expect(screen.getByRole('img', { name: 'Tim White' })).toHaveAttribute(
      'width',
      '120'
    );
  });
});

describe('Avatar state stories', () => {
  it('shows a neutral fallback for an empty identity', () => {
    render(<UserAvatar size='lg' />);

    expect(screen.getByRole('img', { name: 'Avatar' })).toHaveTextContent('?');
  });

  it('shows initials for a name without an image (partial identity)', () => {
    render(<UserAvatar name='Maya Okafor' size='lg' />);

    expect(screen.getByRole('img', { name: 'Maya Okafor' })).toHaveTextContent(
      'MO'
    );
  });

  it('keeps a long name to two initials and the full name as its label', () => {
    const longName =
      'Maximiliana Alejandra Konstantinopoulou-Vanderbilt Featuring The Orchestra';
    render(<UserAvatar name={longName} size='md' />);

    const fallback = screen.getByRole('img', { name: longName });
    expect(fallback).toHaveTextContent(/^MO$/);
    expect(fallback.parentElement).toHaveStyle({
      width: `${getAvatarSizePx('md')}px`,
    });
  });

  it('derives initials from right-to-left names', () => {
    render(
      <div dir='rtl'>
        <UserAvatar name='ليلى حداد' size='lg' />
      </div>
    );

    expect(screen.getByRole('img', { name: 'ليلى حداد' })).toHaveTextContent(
      'لح'
    );
  });
});

describe('Avatar accessibility', () => {
  it('has no axe violations for image, fallback, failed, presence and RTL avatars', async () => {
    const { container } = render(
      <div>
        <UserAvatar name='Tim White' src='/tim-white.png' size='lg' />
        <UserAvatar name='Maya Okafor' size='lg' status='online' />
        <UserAvatar size='md' />
        <UserAvatar name='Alex Chen' src='/broken.png' size='md' ring />
        <div dir='rtl'>
          <UserAvatar name='ליאור כהן' size='lg' status='away' />
        </div>
        <Avatar size='xl' shape='artwork'>
          <AvatarImage src='/cover.png' alt='Release artwork' />
        </Avatar>
      </div>
    );
    fireEvent.error(screen.getByRole('img', { name: 'Alex Chen' }));

    await expectNoA11yViolations(container);
  });
});
