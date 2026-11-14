import { writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { wcag22AaAxeOptions } from '@/lib/a11y-gates/wcag-standard.cjs';

const STORIES = [
  {
    id: 'shadcn-iconbutton--secondary-state-matrix',
    theme: 'light',
    width: 1280,
  },
  {
    id: 'shadcn-iconbutton--secondary-state-matrix-dark',
    theme: 'dark',
    width: 1280,
  },
  {
    id: 'shadcn-iconbutton--secondary-state-matrix-mobile',
    theme: 'light',
    width: 390,
  },
  {
    id: 'shadcn-iconbutton--secondary-state-matrix-dark-mobile',
    theme: 'dark',
    width: 390,
  },
  { id: 'ui-patterns-updatingscreen--light', theme: 'light', width: 1280 },
] as const;

declare global {
  interface Window {
    __scopedThemeProof?: {
      rendered: boolean;
      errors: string[];
      rootThemes: string[];
    };
  }
}

for (const story of STORIES) {
  for (const outer of ['light', 'dark'] as const) {
    test(`${story.id} isolates ${story.theme} tokens from ${outer} canvas`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: story.width, height: 844 });
      await page.emulateMedia({ colorScheme: outer, reducedMotion: 'reduce' });
      await page.addInitScript(theme => {
        localStorage.setItem('jovie-theme-storybook', theme);
        const state = {
          rendered: false,
          errors: [] as string[],
          rootThemes: [] as string[],
        };
        window.__scopedThemeProof = state;
        const observeRoot = () => {
          const root = document.documentElement;
          if (!root) return setTimeout(observeRoot, 5);
          // The shared preview head initially seeds dark before the provider
          // applies the requested mode. Observe stability from that point.
          let requestedModeApplied = false;
          const record = () => {
            requestedModeApplied ||= root.classList.contains(theme);
            if (!requestedModeApplied) return;
            for (const value of ['light', 'dark']) {
              if (root.classList.contains(value)) state.rootThemes.push(value);
            }
          };
          record();
          new MutationObserver(record).observe(root, {
            attributes: true,
            attributeFilter: ['class'],
          });
        };
        observeRoot();
        const attach = () => {
          const channel = (
            window as Window & {
              __STORYBOOK_ADDONS_CHANNEL__?: {
                on: (
                  event: string,
                  listener: (payload?: {
                    status?: string;
                    message?: string;
                  }) => void
                ) => void;
              };
            }
          ).__STORYBOOK_ADDONS_CHANNEL__;
          if (!channel) return setTimeout(attach, 5);
          channel.on('storyRendered', () => {
            state.rendered = true;
          });
          channel.on('storyFinished', payload => {
            if (payload?.status === 'error')
              state.errors.push('storyFinished: error');
          });
          for (const name of [
            'storyErrored',
            'storyThrewException',
            'playFunctionThrewException',
          ]) {
            channel.on(name, payload => {
              state.errors.push(`${name}: ${payload?.message ?? 'unknown'}`);
            });
          }
        };
        attach();
      }, outer);
      await page.goto(`/iframe.html?id=${story.id}&viewMode=story`, {
        waitUntil: 'domcontentloaded',
      });
      await expect
        .poll(() => page.evaluate(() => window.__scopedThemeProof?.rendered))
        .toBe(true);
      await expect(page.locator('html')).toHaveClass(
        new RegExp(`(?:^|\\s)${outer}(?:\\s|$)`)
      );
      expect(
        await page.evaluate(() => localStorage.getItem('jovie-theme-storybook'))
      ).toBe(outer);
      expect(
        await page.evaluate(() => window.__scopedThemeProof?.errors)
      ).toEqual([]);
      const scope = page.locator(`[data-proof-theme="${story.theme}"]`);
      await expect(scope).toBeVisible();
      await expect(scope).toHaveCSS('color-scheme', story.theme);
      const surface = scope.locator(
        '[data-slot="updating-screen"], :scope > .bg-surface-0'
      );
      await expect(surface).toHaveCSS(
        'background-color',
        story.theme === 'light' ? 'rgb(249, 250, 252)' : 'rgb(7, 8, 10)'
      );
      const primaryColor =
        story.theme === 'light' ? 'lch(9.894 0 282)' : 'rgb(245, 247, 251)';
      await expect(surface).toHaveCSS('color', primaryColor);
      const measurements: Record<string, unknown> = {
        story: story.id,
        outer,
        local: story.theme,
      };

      measurements.afterPlay = await surface.evaluate(node => ({
        surface: {
          color: getComputedStyle(node).color,
          background: getComputedStyle(node).backgroundColor,
        },
        control: (() => {
          const button = document.querySelector('button[data-state="idle"]');
          if (!button) return null;
          const style = getComputedStyle(button);
          return {
            color: style.color,
            background: style.backgroundColor,
            width: button.getBoundingClientRect().width,
            height: button.getBoundingClientRect().height,
          };
        })(),
      }));
      if (story.id.startsWith('shadcn-iconbutton')) {
        const control = scope.getByRole('button', {
          name: `${story.theme === 'dark' ? 'Dark' : 'Light'} Rest`,
          exact: true,
        });
        await page.mouse.move(0, 0);
        await control.evaluate(node => node.blur());
        await expect(control).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(control).toHaveCSS(
          'color',
          story.theme === 'light' ? 'rgb(90, 96, 106)' : 'rgb(160, 165, 175)'
        );
        const sample = () =>
          control.evaluate(node => {
            const style = getComputedStyle(node);
            const hit = getComputedStyle(node, '::before');
            return {
              color: style.color,
              background: style.backgroundColor,
              ring: style.boxShadow,
              box: [
                node.getBoundingClientRect().width,
                node.getBoundingClientRect().height,
              ],
              hit: [hit.width, hit.height],
            };
          });
        measurements.rest = await sample();
        await control.hover();
        await expect(control).toHaveCSS(
          'background-color',
          story.theme === 'light'
            ? 'oklch(0 0 0 / 0.06)'
            : 'rgba(168, 176, 195, 0.06)'
        );
        await expect(control).toHaveCSS('color', primaryColor);
        measurements.hover = await sample();
        await page.mouse.move(0, 0);
        await page.keyboard.press('Tab');
        await control.focus();
        await expect(control).toBeFocused();
        expect(
          await control.evaluate(node => node.matches(':focus-visible'))
        ).toBe(true);
        await expect(control).toHaveCSS(
          'background-color',
          story.theme === 'light'
            ? 'oklch(0 0 0 / 0.06)'
            : 'rgba(168, 176, 195, 0.06)'
        );
        await expect(control).toHaveCSS('color', primaryColor);
        measurements.focus = await sample();
        expect((measurements.focus as { ring: string }).ring).toContain(
          'rgb(17, 175, 255)'
        );
        await control.hover();
        await page.mouse.down();
        await expect(control).toHaveCSS(
          'background-color',
          story.theme === 'light'
            ? 'oklch(0 0 0 / 0.12)'
            : 'rgba(17, 175, 255, 0.1)'
        );
        await expect(control).toHaveCSS('color', primaryColor);
        measurements.pressed = await sample();
        await page.mouse.up();
        await page.mouse.move(0, 0);
        await control.evaluate(node => node.blur());
        await expect(
          scope.getByRole('button', { name: / Disabled$/ })
        ).toBeDisabled();
        await expect(
          scope.getByRole('button', { name: / Loading$/ })
        ).toHaveAttribute('aria-busy', 'true');
        for (const button of await scope.getByRole('button').all()) {
          expect(
            await button.evaluate(node => [
              node.getBoundingClientRect().width,
              node.getBoundingClientRect().height,
            ])
          ).toEqual([32, 32]);
          expect(
            await button.evaluate(node => {
              const style = getComputedStyle(node, '::before');
              return [style.width, style.height];
            })
          ).toEqual(['44px', '44px']);
        }
      } else {
        await expect(
          scope.getByRole('heading', { name: 'Updating Jovie' })
        ).toBeVisible();
        await expect(
          scope.getByRole('progressbar', { name: 'Download progress' })
        ).toHaveAttribute('aria-valuenow', '35');
        measurements.progress = await scope
          .getByRole('progressbar')
          .evaluate(node => ({
            track: getComputedStyle(node).backgroundColor,
            fill: getComputedStyle(node.firstElementChild!).backgroundColor,
            title: getComputedStyle(
              document.querySelector('[data-slot="updating-screen"] h1')!
            ).color,
          }));
      }
      const axe = await new AxeBuilder({ page })
        .include('[data-proof-theme]')
        .options(wcag22AaAxeOptions())
        .analyze();
      expect(axe.violations).toEqual([]);
      expect(
        axe.incomplete.filter(result => result.id === 'color-contrast')
      ).toEqual([]);
      const binding = await page.evaluate(() => ({
        classes: document.documentElement.className,
        scheme: document.documentElement.style.colorScheme,
        stored: localStorage.getItem('jovie-theme-storybook'),
        ...window.__scopedThemeProof,
      }));
      expect(binding.classes.split(/\s+/)).toContain(outer);
      expect(binding.scheme).toBe(outer);
      expect(binding.stored).toBe(outer);
      expect(binding.errors).toEqual([]);
      expect(binding.rootThemes?.length).toBeGreaterThan(0);
      expect(binding.rootThemes?.every(value => value === outer)).toBe(true);
      const evidencePath = testInfo.outputPath('theme-isolation.json');
      await writeFile(
        evidencePath,
        JSON.stringify({ ...measurements, binding, axe }, null, 2)
      );
      await testInfo.attach('theme-isolation.json', {
        path: evidencePath,
        contentType: 'application/json',
      });
      const imagePath = testInfo.outputPath('theme-isolation.png');
      await page.screenshot({ path: imagePath, animations: 'disabled' });
      await testInfo.attach('theme-isolation.png', {
        path: imagePath,
        contentType: 'image/png',
      });
    });
  }
}
