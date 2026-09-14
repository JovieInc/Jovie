import { afterEach, describe, expect, it, vi } from 'vitest';
import { installStorybookMotionFixtures } from '../../../.storybook/motion-fixtures';

const originalMatchMedia = window.matchMedia;
afterEach(() => {
  window.matchMedia = originalMatchMedia;
  document
    .querySelectorAll('[data-jovie-storybook-fixtures]')
    .forEach(el => el.remove());
  window.history.replaceState(null, '', '/');
});

describe('Storybook motion fixtures', () => {
  it.each(['', '?__jovie_motion=unknown', '?__jovie_motion=LIVE'])(
    'keeps snapshots frozen for %s',
    search => {
      window.history.replaceState(null, '', `/${search}`);
      installStorybookMotionFixtures(window);
      expect(
        document.querySelector('[data-jovie-storybook-fixtures]')?.textContent
      ).toContain('animation-duration: 0s !important');
      const media = window.matchMedia('(prefers-reduced-motion: reduce)');
      expect(media.matches).toBe(true);
      expect(window.matchMedia('(prefers-color-scheme: dark)').matches).toBe(
        false
      );
      expect(media.dispatchEvent(new Event('change'))).toBe(false);
      media.addListener(() => undefined);
      media.removeListener(() => undefined);
      media.addEventListener('change', () => undefined);
      media.removeEventListener('change', () => undefined);
    }
  );

  it('preserves the browser media implementation and animation CSS for exact live opt-in', () => {
    window.history.replaceState(null, '', '/?__jovie_motion=live');
    const nativeMedia = vi.fn().mockReturnValue({ matches: false });
    window.matchMedia = nativeMedia;
    installStorybookMotionFixtures(window);
    expect(window.matchMedia).toBe(nativeMedia);
    expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(
      false
    );
    expect(
      document.querySelector('[data-jovie-storybook-fixtures]')
    ).toBeNull();
  });
});
