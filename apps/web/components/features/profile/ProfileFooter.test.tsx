import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { Artist } from '@/types/db';
import { ProfileFooter } from './ProfileFooter';

const ARTIST = { id: 'artist-1', handle: 'tim', name: 'Tim White' } as Artist;

/*
 * The footer renders its legal nav twice: one copy is `md:hidden` (mobile)
 * and one is `max-md:hidden` (desktop). jsdom loads no Tailwind CSS, so both
 * copies look visible to axe. Each test applies the one rule the browser
 * applies at that breakpoint, so axe sees exactly what a user's browser
 * exposes.
 */
const BREAKPOINT_CSS = {
  mobile: '.max-md\\:hidden { display: none; }',
  desktop: '.md\\:hidden { display: none; }',
} as const;

let breakpointStyle: HTMLStyleElement | null = null;

function atBreakpoint(breakpoint: keyof typeof BREAKPOINT_CSS) {
  breakpointStyle = document.createElement('style');
  breakpointStyle.textContent = BREAKPOINT_CSS[breakpoint];
  document.head.append(breakpointStyle);
}

afterEach(() => {
  breakpointStyle?.remove();
  breakpointStyle = null;
});

describe('ProfileFooter', () => {
  it.each(['mobile', 'desktop'] as const)(
    'renders one legal nav with a report link for the artist at %s width',
    async breakpoint => {
      atBreakpoint(breakpoint);
      const { container } = render(<ProfileFooter artist={ARTIST} />);

      expect(screen.getByRole('contentinfo')).toBeInTheDocument();
      const legal = screen.getByRole('navigation', { name: 'Legal' });
      expect(legal).toBeVisible();
      expect(screen.getByRole('link', { name: 'Privacy' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Terms' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Report' })).toHaveAttribute(
        'href',
        `${APP_ROUTES.REPORT}?type=profile&target=tim`
      );
      await expectNoA11yViolations(container);
    }
  );

  it('encodes an unusual handle in the report link', async () => {
    atBreakpoint('mobile');
    const { container } = render(
      <ProfileFooter artist={{ ...ARTIST, handle: 'tim white&co' }} />
    );

    expect(screen.getByRole('link', { name: 'Report' })).toHaveAttribute(
      'href',
      `${APP_ROUTES.REPORT}?type=profile&target=tim%20white%26co`
    );
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in a right-to-left document', async () => {
    atBreakpoint('desktop');
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ProfileFooter artist={ARTIST} />
      </div>
    );

    expect(container.firstElementChild).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('link', { name: 'Report' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
