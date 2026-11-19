import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

vi.mock('@/components/atoms/SocialIcon', () => {
  const MockSocialIcon = ({ className }: { className?: string }) => (
    <span data-testid='social-icon' className={className} />
  );
  return {
    __esModule: true,
    SocialIcon: MockSocialIcon,
    getPlatformIcon: () => ({ hex: '000000' }),
    getPlatformIconMetadata: () => ({ hex: '000000' }),
  } as unknown as typeof import('@/components/atoms/SocialIcon');
});

import { MUSIC_FIRST_ORDER, SUGGESTION_PILLS } from './config';
import { QuickAddSuggestions } from './QuickAddSuggestions';

describe('QuickAddSuggestions certificate', () => {
  it('sends the prefill URL of the pill that was pressed', async () => {
    const onPlatformSelect = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <QuickAddSuggestions
        existingPlatforms={new Set()}
        onPlatformSelect={onPlatformSelect}
      />
    );

    const region = screen.getByRole('region', {
      name: 'Quick link suggestions',
    });
    expect(within(region).getAllByRole('button')).toHaveLength(
      SUGGESTION_PILLS.length
    );
    await expectNoA11yViolations(container);

    await user.click(
      screen.getByRole('button', { name: /Select Apple Music/ })
    );
    expect(onPlatformSelect).toHaveBeenCalledTimes(1);
    expect(onPlatformSelect).toHaveBeenCalledWith(
      'https://music.apple.com/artist/'
    );

    await user.click(
      screen.getByRole('button', { name: /Select Spotify Artist/ })
    );
    expect(onPlatformSelect).toHaveBeenLastCalledWith(
      '__SEARCH_MODE__:spotify'
    );
  });

  it('puts streaming platforms first for a music profile and drops added ones', async () => {
    const { container } = render(
      <QuickAddSuggestions
        existingPlatforms={new Set(['youtube', 'instagram'])}
        isMusicProfile
        onPlatformSelect={vi.fn()}
      />
    );

    const labels = screen
      .getAllByRole('button')
      .map(button => button.textContent ?? '');
    const firstMusicId = MUSIC_FIRST_ORDER[0];
    const firstMusicLabel = SUGGESTION_PILLS.find(
      pill => pill.id === firstMusicId
    )?.label;
    expect(firstMusicLabel).toBeTruthy();
    expect(labels[0]).toContain(firstMusicLabel);
    expect(
      screen.queryByRole('button', { name: /Select Instagram/ })
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Select YouTube Music/ })
    ).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders nothing once every platform is added', async () => {
    const { container } = render(
      <QuickAddSuggestions
        existingPlatforms={new Set(SUGGESTION_PILLS.map(pill => pill.id))}
        onPlatformSelect={vi.fn()}
      />
    );

    expect(screen.queryByTestId('quick-add-suggestions')).toBeNull();
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });
});
