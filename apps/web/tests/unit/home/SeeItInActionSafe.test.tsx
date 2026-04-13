import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FALLBACK_AVATARS } from '@/features/home/featured-creators-fallback';
import { SeeItInActionSafe } from '@/features/home/SeeItInActionSafe';

describe('SeeItInActionSafe', () => {
  it('stays hidden when disabled', () => {
    render(<SeeItInActionSafe enabled={false} />);

    expect(screen.queryByTestId('homepage-live-proof')).not.toBeInTheDocument();
  });

  it('renders static fallback proof cards when enabled', () => {
    render(<SeeItInActionSafe enabled />);

    expect(screen.getByTestId('homepage-live-proof')).toBeInTheDocument();

    for (const creator of FALLBACK_AVATARS.slice(0, 3)) {
      expect(screen.getByText(creator.name)).toBeInTheDocument();
      expect(screen.getByText(`jov.ie/${creator.handle}`)).toBeInTheDocument();
    }
  });
});
