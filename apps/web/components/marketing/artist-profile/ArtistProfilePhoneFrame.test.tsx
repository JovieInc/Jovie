import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ArtistProfilePhoneFrame } from './ArtistProfilePhoneFrame';
import storyMeta, { Default } from './ArtistProfilePhoneFrame.stories';

describe('ArtistProfilePhoneFrame', () => {
  it('preserves the full registry-export aspect without decorative screen occlusion', () => {
    const { container } = render(
      <ArtistProfilePhoneFrame>
        <img
          alt='Artist profile preview'
          src='/product-screenshots/profile-phone.png'
        />
      </ArtistProfilePhoneFrame>
    );

    expect(container.querySelector('.ap-phone-frame__screen')).toHaveClass(
      'aspect-[195/422]'
    );
    expect(
      container.querySelector('.ap-phone-frame__notch')
    ).not.toBeInTheDocument();
    expect(
      container.querySelector('.ap-phone-frame__overlay')
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Artist profile preview' })
    ).toBeVisible();
  });

  it('keeps its Storybook receipt bound to the production component', () => {
    expect(storyMeta.component).toBe(ArtistProfilePhoneFrame);
    expect(Default.args?.children).toBeDefined();
  });
});
