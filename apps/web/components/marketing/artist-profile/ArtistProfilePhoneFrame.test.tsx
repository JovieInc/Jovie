import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ArtistProfilePhoneFrame } from './ArtistProfilePhoneFrame';

const css = readFileSync(
  path.resolve(__dirname, 'ArtistProfilePhoneFrame.css'),
  'utf8'
);

describe('ArtistProfilePhoneFrame', () => {
  it('renders the public profile bezel-free with size variants', () => {
    const { container, rerender } = render(
      <ArtistProfilePhoneFrame>
        <img alt='' />
      </ArtistProfilePhoneFrame>
    );
    const frame = container.querySelector('.ap-phone-frame');
    expect(frame).toHaveAttribute('data-size', 'lg');
    expect(
      frame?.querySelector('[data-device="mobile-web"]')
    ).toBeInTheDocument();

    rerender(
      <ArtistProfilePhoneFrame size='sm'>
        <img alt='' />
      </ArtistProfilePhoneFrame>
    );
    expect(container.querySelector('.ap-phone-frame')).toHaveAttribute(
      'data-size',
      'sm'
    );
  });

  it('draws no simulated hardware (founder device policy 2026-09-29)', () => {
    const { container } = render(
      <ArtistProfilePhoneFrame>
        <img alt='' />
      </ArtistProfilePhoneFrame>
    );
    expect(container.querySelector('[class*="notch"]')).toBeNull();
    expect(container.querySelector('[class*="overlay"]')).toBeNull();
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(rules).not.toMatch(/notch|box-shadow|gradient/);
  });
});
