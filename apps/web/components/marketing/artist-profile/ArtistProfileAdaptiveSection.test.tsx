import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtistProfileAdaptiveSection } from './ArtistProfileAdaptiveSection';
import storyMeta from './ArtistProfileAdaptiveSection.stories';

const { adaptive } = ARTIST_PROFILE_COPY;

describe('ArtistProfileAdaptiveSection', () => {
  it('stamps the feature-split section and mounts the mode switcher', async () => {
    const { container } = render(
      <ArtistProfileAdaptiveSection adaptive={storyMeta.args.adaptive} />
    );
    const root = screen.getByTestId('marketing-section-feature-split');
    expect(root).toHaveAttribute('data-marketing-variant', 'phone-right');
    expect(root).toHaveAttribute('data-marketing-occurrence', 'adaptive');
    // Live LP embeds ModeSwitcher in the hero; this owner stays for Storybook.
    expect(root).toHaveAttribute(
      'data-marketing-owner',
      'apps/web/components/marketing/artist-profile/ArtistProfileAdaptiveSection.tsx'
    );
    expect(container.querySelector('#adaptive')).toBe(root);
    expect(
      within(root).getByRole('tablist', { name: 'Profile Modes' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(adaptive.modes.length);
    await expectNoA11yViolations(container);
  });

  it('switches the active mode and phone capture when a tab is chosen', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ArtistProfileAdaptiveSection adaptive={adaptive} />
    );
    const target = adaptive.modes[1];
    const tab = screen.getByRole('tab', { name: target.label });
    await user.click(tab);
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(
      within(screen.getByRole('tabpanel', { name: target.label })).getByText(
        target.headline
      )
    ).toBeVisible();
    expect(
      screen.getByRole('img', { name: target.screenshotAlt })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
