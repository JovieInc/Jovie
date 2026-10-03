import { render, screen } from '@testing-library/react';
import Link from 'next/link';
import { describe, expect, it } from 'vitest';
import { HomePhoneFrame } from '@/components/features/home/HomePhoneFrame';
import { MobileWebScreen, OfficialIPhoneFrame } from './DeviceScreen';
import { OFFICIAL_IPHONE_BEZEL } from './deviceBezels';

describe('device screen content and accessibility', () => {
  it('keeps mobile web content interactive without exposing device artwork', () => {
    const { rerender } = render(
      <MobileWebScreen className='profile-preview' testId='web-preview'>
        <Link href='/smart-links'>Open smart link</Link>
      </MobileWebScreen>
    );

    expect(
      screen.getByRole('link', { name: 'Open smart link' })
    ).toHaveAttribute('href', '/smart-links');
    expect(screen.getByTestId('web-preview')).toHaveClass('profile-preview');
    expect(screen.queryByRole('img', { hidden: true })).toBeNull();

    rerender(<MobileWebScreen>Updated profile</MobileWebScreen>);
    expect(screen.getByText('Updated profile')).toBeInTheDocument();
    expect(screen.queryByTestId('web-preview')).toBeNull();
  });

  it('exposes the native capture once and keeps the official bezel decorative', () => {
    const { container, rerender } = render(
      <OfficialIPhoneFrame
        screenshot={{
          platform: 'ios-native',
          src: '/native-capture.png',
          alt: 'Jovie iOS release editor',
          width: 402,
          height: 874,
        }}
        sizes='402px'
        className='native-preview'
      />
    );

    const capture = screen.getByRole('img', {
      name: 'Jovie iOS release editor',
    });
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(capture).toHaveAttribute('width', '402');
    expect(capture).toHaveAttribute('height', '874');
    expect(capture).toHaveAttribute('sizes', '402px');
    expect(capture.getAttribute('src')).toContain('native-capture.png');
    const bezel = container.querySelector('img[aria-hidden="true"]');
    expect(bezel).toHaveAttribute('src', OFFICIAL_IPHONE_BEZEL.src);
    expect(bezel).toHaveAttribute('alt', '');
    expect(bezel).toHaveAttribute('width', String(OFFICIAL_IPHONE_BEZEL.width));
    expect(bezel).toHaveAttribute(
      'height',
      String(OFFICIAL_IPHONE_BEZEL.height)
    );
    expect(container.querySelector('figure')).toHaveClass('native-preview');

    rerender(
      <OfficialIPhoneFrame
        screenshot={{
          platform: 'ios-native',
          src: '/updated-native-capture.png',
          alt: 'Updated iOS editor',
          width: 402,
          height: 874,
        }}
        sizes='100vw'
        priority
      />
    );
    expect(
      screen.getByRole('img', { name: 'Updated iOS editor' })
    ).toHaveAttribute('sizes', '100vw');
    expect(
      screen.queryByRole('img', { name: 'Jovie iOS release editor' })
    ).toBeNull();
  });

  it('preserves content through regular and compact homepage wrappers', () => {
    const { container, rerender } = render(
      <HomePhoneFrame className='preview-placement'>
        <button type='button'>Play release</button>
      </HomePhoneFrame>
    );
    expect(
      screen.getByRole('button', { name: 'Play release' })
    ).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('preview-placement');
    const regularWidth = container.firstElementChild?.className;

    rerender(
      <HomePhoneFrame compact>
        <button type='button'>Play release</button>
      </HomePhoneFrame>
    );
    expect(container.firstElementChild?.className).not.toBe(regularWidth);
    expect(
      screen.getByRole('button', { name: 'Play release' })
    ).toBeInTheDocument();

    expect(screen.queryByRole('img', { hidden: true })).toBeNull();
  });
});
