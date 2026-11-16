import { expect, test } from '@playwright/test';
import {
  captureStill,
  waitForSettledProfile,
  waitForSettledProfileLayout,
} from './profile-admission-layout';
import { auditPublicProfileLayout } from './public-profile-layout-invariant';
import { installPublicRouteMocks } from './public-surface-helpers';

export function registerProfileNameAdmissionTests() {
  test('UNMARKED stays readable inside the desktop cover at short and tall heights', async ({
    page,
  }, testInfo) => {
    await installPublicRouteMocks(page);
    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 1440, height: 900 },
      { width: 1920, height: 600 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(
        '/renders/profile-admission?layout=public&state=claimed&name=unmarked',
        {
          waitUntil: 'domcontentloaded',
        }
      );
      await waitForSettledProfileLayout(page, 'desktop');
      const header = page
        .getByTestId('profile-desktop-cover')
        .getByTestId('profile-header');
      await expect(header).toHaveText('UNMARKED');
      const nameLineCount = await header.evaluate(element => {
        const name = element.querySelector('span');
        if (!name) throw new Error('desktop name missing');
        const range = document.createRange();
        range.selectNodeContents(name);
        return Array.from(range.getClientRects()).filter(rect => rect.width > 0)
          .length;
      });
      expect(
        nameLineCount,
        'the final D must not be stranded on its own line'
      ).toBe(1);
      const audit = await auditPublicProfileLayout(page);
      await captureStill(
        page,
        testInfo,
        `unmarked-${viewport.width}x${viewport.height}.png`
      );
      expect(audit.violations, JSON.stringify(audit, null, 2)).toEqual([]);
    }
  });

  test('desktop names wrap without horizontal clipping for enlarged and unbroken text', async ({
    page,
  }) => {
    await installPublicRouteMocks(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(
      '/renders/profile-admission?layout=public&state=claimed&name=unmarked',
      {
        waitUntil: 'domcontentloaded',
      }
    );
    await waitForSettledProfileLayout(page, 'desktop');
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    await waitForSettledProfile(page);
    expect(
      (await auditPublicProfileLayout(page)).violations.filter(
        violation => violation.code === 'artist_name_clipped'
      )
    ).toEqual([]);
    await page.getByTestId('profile-header').evaluate(header => {
      const name = header.querySelector('span');
      if (!name) throw new Error('desktop name missing');
      name.textContent = 'UNMARKEDUNMARKEDUNMARKEDUNMARKED';
    });
    await waitForSettledProfile(page);
    // The existing two-line clamp may elide later lines, but never clip
    // a visible line horizontally through a letter.
    expect(
      (await auditPublicProfileLayout(page)).violations.filter(
        violation => violation.code === 'artist_name_clipped'
      )
    ).toEqual([]);
  });

  test('deliberate red detects text clipped inside a contained desktop name box', async ({
    page,
  }) => {
    await installPublicRouteMocks(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/renders/profile-admission?layout=public&state=claimed', {
      waitUntil: 'domcontentloaded',
    });
    await waitForSettledProfileLayout(page, 'desktop');
    expect((await auditPublicProfileLayout(page)).violations).toEqual([]);
    await page.getByTestId('profile-header').evaluate(header => {
      const name = header.querySelector('span');
      if (!name) throw new Error('desktop name missing');
      name.textContent = 'UNMARKED';
      name.style.fontSize = '160px';
      name.style.whiteSpace = 'nowrap';
    });
    expect(
      (await auditPublicProfileLayout(page)).violations.map(
        violation => violation.code
      )
    ).toContain('artist_name_clipped');
  });
}
