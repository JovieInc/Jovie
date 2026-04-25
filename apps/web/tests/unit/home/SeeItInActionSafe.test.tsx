import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FALLBACK_AVATARS } from '@/features/home/featured-creators-fallback';
import { SeeItInActionSafe } from '@/features/home/SeeItInActionSafe';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

describe('SeeItInActionSafe', () => {
  it('stays hidden when disabled', () => {
    render(<SeeItInActionSafe enabled={false} />);

    expect(screen.queryByTestId('homepage-live-proof')).not.toBeInTheDocument();
  });

  it('renders static fallback proof cards when enabled', () => {
    render(<SeeItInActionSafe enabled />);

    expect(screen.getByTestId('homepage-live-proof')).toBeInTheDocument();
    expect(FALLBACK_AVATARS.map(creator => creator.name)).toEqual([
      TIM_WHITE_PROFILE.name,
    ]);
    expect(FALLBACK_AVATARS[0]).toMatchObject({
      handle: TIM_WHITE_PROFILE.handle,
      name: TIM_WHITE_PROFILE.name,
      src: TIM_WHITE_PROFILE.avatarSrc,
    });

    for (const creator of FALLBACK_AVATARS) {
      expect(screen.getByText(creator.name)).toBeInTheDocument();
      expect(screen.getByText(`jov.ie/${creator.handle}`)).toBeInTheDocument();
    }
  });
});
