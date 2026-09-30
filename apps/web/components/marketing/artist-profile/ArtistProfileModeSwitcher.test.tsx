import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileModeSwitcher } from './ArtistProfileModeSwitcher';
import storyMeta, { Compact, Intro } from './ArtistProfileModeSwitcher.stories';

describe('ArtistProfileModeSwitcher', () => {
  it.each([true, false])(
    'keeps server-rendered mode choices pending (intro=%s)',
    showIntroHeading => {
      const server = document.createElement('div');
      server.innerHTML = renderToString(
        <ArtistProfileModeSwitcher
          adaptive={ARTIST_PROFILE_COPY.adaptive}
          showIntroHeading={showIntroHeading}
        />
      );
      const choices = server.querySelectorAll('button[role="tab"]');
      expect(choices).toHaveLength(4);
      for (const choice of choices) {
        expect(choice).toHaveAttribute('disabled');
      }
      expect(
        server.querySelector('[data-interactive-ready="false"]')
      ).toHaveAttribute('aria-busy', 'true');
    }
  );

  it.each([true, false])(
    'preserves the requested hydrated transition (intro=%s)',
    async showIntroHeading => {
      const user = userEvent.setup();
      const { container } = render(
        <ArtistProfileModeSwitcher
          adaptive={ARTIST_PROFILE_COPY.adaptive}
          showIntroHeading={showIntroHeading}
        />
      );
      expect(
        container.querySelector('[data-interactive-ready="true"]')
      ).toHaveAttribute('aria-busy', 'false');
      const choice = screen.getByRole('tab', { name: 'Out now' });
      expect(choice).toBeEnabled();
      await user.click(choice);
      expect(choice).toHaveAttribute('aria-selected', 'true');
      const panel = screen.getByRole('tabpanel', { name: 'Out now' });
      expect(
        within(panel).getByText(
          'When the song is live, fans go straight to the right service.',
          { exact: true }
        )
      ).toBeVisible();
    }
  );

  it('keeps the tabbed phone-mode source contract bounded and accessible', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'components/marketing/artist-profile/ArtistProfileModeSwitcher.tsx'
      ),
      'utf8'
    );

    expect(source).toContain("aria-label='Profile Modes'");
    expect(source).toContain("'ap-mode-switcher__headline'");
    expect(source).toContain("'line-clamp-2'");
    expect(source).toContain("layoutId='artist-profile-mode-active-tab'");
    expect(source).toContain('useReducedMotion');
  });

  it('reserves the panel slot at the tallest mode so tabs never reflow vertically', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'components/marketing/artist-profile/ArtistProfileModeSwitcher.tsx'
      ),
      'utf8'
    );

    expect(source).toContain('-sizer');
    expect(source).toContain("aria-hidden='true'");
    expect(source).toContain('col-start-1 row-start-1');
    expect(source).toContain('min-h-20');
    expect(source).toContain('slideDirection');
  });

  it('keeps the adjacent Storybook receipt bound to both mode-switcher layouts', () => {
    expect(storyMeta.component).toBe(ArtistProfileModeSwitcher);
    expect(Intro.args?.adaptive).toBe(ARTIST_PROFILE_COPY.adaptive);
    expect(Intro.args?.showIntroHeading).toBe(true);
    expect(Compact.args?.adaptive).toBe(ARTIST_PROFILE_COPY.adaptive);
    expect(Compact.args?.showIntroHeading).toBe(false);
  });
});
