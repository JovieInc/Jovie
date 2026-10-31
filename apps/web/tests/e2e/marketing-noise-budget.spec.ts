import type { Page } from '@playwright/test';
import { expect, test } from './setup';

/**
 * Rendered quiet-surface budget (founder bans, 2026-10-28). Static twin:
 * scripts/lint-design-noise.mjs.
 *
 *  1. No visible "Step N" text (sr-only is fine).
 *  2. No icon/emoji as the sole content of a bordered or filled container.
 *  3. Single-field forms carry at most title + field + one microcopy line.
 *
 * The deliberate-red tests inject the offending DOM and prove the detector
 * fires; their screenshots are the negative exemplars for the vision critic
 * (`design-canonical`: Quiet Surfaces).
 *
 * @layout-guard
 */

const ROUTES = ['/', '/pay', '/pricing', '/changelog', '/download'] as const;

async function noiseViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return (
        r.width > 2 &&
        r.height > 2 &&
        s.visibility !== 'hidden' &&
        s.display !== 'none'
      );
    };

    // 1. Visible "Step N" labels.
    for (const el of document.querySelectorAll('body *')) {
      if (el.children.length > 0) continue;
      if (/^\s*step\s*\d+\s*$/i.test(el.textContent ?? '') && visible(el)) {
        out.push(`step-label: "${el.textContent?.trim()}"`);
      }
    }

    // 2. Icon tiles: one svg/emoji child in a bordered or filled box.
    for (const el of document.querySelectorAll('body div, body span')) {
      if (!visible(el)) continue;
      if (el.closest('button, a, [role="button"], [data-slot="avatar"], nav')) {
        continue;
      }
      const onlySvg =
        el.children.length === 1 &&
        el.children[0]?.tagName.toLowerCase() === 'svg' &&
        (el.textContent ?? '').trim() === '';
      const onlyEmoji =
        el.children.length === 0 &&
        /^\p{Extended_Pictographic}+$/u.test((el.textContent ?? '').trim());
      if (!onlySvg && !onlyEmoji) continue;
      const s = getComputedStyle(el);
      const border = Number.parseFloat(s.borderTopWidth) > 0;
      const fill = !/rgba?\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)|transparent/.test(
        s.backgroundColor
      );
      if (border || fill) out.push(`icon-tile: <${el.tagName.toLowerCase()}>`);
    }

    // 3. Single-field form text-layer budget (title + one microcopy line).
    for (const form of document.querySelectorAll('form')) {
      const fields = [...form.querySelectorAll('input, textarea')].filter(
        f =>
          !['hidden', 'checkbox', 'radio', 'submit'].includes(
            (f as HTMLInputElement).type
          ) && visible(f)
      );
      if (fields.length !== 1) continue;
      // The subscribe card is its own section; other forms are judged on
      // their immediate wrapper so a hero's h1 is not counted against a claim form.
      const scope =
        form.closest('[data-pen-source="qKrDn"]') ?? form.parentElement ?? form;
      const layers = [
        ...scope.querySelectorAll('h1, h2, h3, h4, p, label, legend, small'),
      ].filter(
        el =>
          visible(el) &&
          !el.closest('[role="alert"], [role="status"], [aria-live]') &&
          (el.textContent ?? '').trim() !== ''
      );
      if (layers.length > 2) {
        out.push(`text-layers: ${layers.length} (max 2: title + microcopy)`);
      }
    }
    return out;
  });
}

test.describe('marketing quiet-surface budget', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const route of ROUTES) {
    test(`${route} has no icon tiles, step labels or noisy single-field forms`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      expect(await noiseViolations(page)).toEqual([]);
    });
  }

  test('deliberate red: injected tile, step label and five-layer form are detected', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/pricing');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
      const host = document.createElement('div');
      host.id = 'noise-red';
      host.style.cssText =
        'position:fixed;inset:80px auto auto 40px;z-index:99999;background:#111;padding:24px;width:420px';
      host.innerHTML = `
        <div style="width:44px;height:44px;border:1px solid #666;background:#222;border-radius:12px;display:flex;align-items:center;justify-content:center"><svg width="20" height="20"><circle cx="10" cy="10" r="8"/></svg></div>
        <span>Step 1</span>
        <section><h2>Get product updates</h2><p>New features and improvements from Jovie.</p>
        <form><label>Email Address</label><input type="email" placeholder="you@email.com"/><button type="submit" disabled>Subscribe</button><p>Subscribe to Jovie changelog emails. Unsubscribe anytime.</p></form></section>`;
      document.body.appendChild(host);
    });
    const violations = await noiseViolations(page);
    expect(violations.some(v => v.startsWith('icon-tile'))).toBe(true);
    expect(violations.some(v => v.startsWith('step-label'))).toBe(true);
    expect(violations.some(v => v.startsWith('text-layers'))).toBe(true);
    await testInfo.attach('noise-DELIBERATE-RED', {
      body: await page.locator('#noise-red').screenshot(),
      contentType: 'image/png',
    });
  });
});
