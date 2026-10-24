import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import {
  classifyRenderedTarget,
  wcag22AaAxeOptions,
} from '@/lib/a11y-gates/wcag-standard.cjs';

const pageShell = (body: string, title: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body { margin: 0; background: #fff; color: #161616; font: 16px/1.4 sans-serif; }
      button.ok { width: 48px; height: 48px; padding: 0; border: 0; background: #161616; color: #fff; }
      button.tiny { width: 16px; height: 16px; padding: 0; border: 0; margin: 0; background: #161616; color: #fff; font-size: 10px; line-height: 16px; }
      a.nav { display: inline-block; min-width: 48px; min-height: 48px; color: #161616; }
    </style>
  </head>
  <body>${body}</body>
</html>`;

const compliantLibrary = pageShell(
  `<header>
     <nav aria-label="Library">
       <a class="nav" href="#releases">Releases</a>
     </nav>
   </header>
   <main>
     <h1>Library</h1>
     <button class="ok" type="button">Save</button>
   </main>`,
  'Library'
);

const undersizedControls = pageShell(
  `<main>
     <h1>Library</h1>
     <button class="tiny" type="button">Save</button><button class="tiny" type="button">Edit</button>
   </main>`,
  'Library'
);

const failingLibrary = pageShell(
  `<header>
     <nav aria-label="Library">
       <a class="nav" href="#releases">Releases</a>
     </nav>
   </header>
   <main>
     <h1>Library</h1>
     <p style="color:#b0b0b0">Muted catalog note</p>
     <button class="tiny" type="button">Save</button><button class="tiny" type="button">Edit</button>
   </main>`,
  'Library'
);

const compliantControl = pageShell(
  `<main><h1>Library</h1><button class="ok" type="button">Save</button></main>`,
  'Library'
);

async function scan(page: Page) {
  return new AxeBuilder({ page }).options(wcag22AaAxeOptions()).analyze();
}

test.describe('rendered WCAG 2.2 AA gate', () => {
  test('a 16px control fails target-size and the box measurement', async ({
    page,
  }) => {
    await page.setContent(undersizedControls);
    const box = await page.locator('button.tiny').first().boundingBox();
    expect(box).not.toBeNull();
    expect(classifyRenderedTarget(box ?? { width: 0, height: 0 })).toBe(
      'undersized'
    );
    const results = await scan(page);
    expect(results.violations.map(violation => violation.id)).toContain(
      'target-size'
    );
  });

  test('a 48px control passes target-size and the box measurement', async ({
    page,
  }) => {
    await page.setContent(compliantControl);
    const box = await page.locator('button.ok').boundingBox();
    expect(box).not.toBeNull();
    expect(classifyRenderedTarget(box ?? { width: 0, height: 0 })).toBe('ok');
    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });

  test('a compliant signed-in library shell passes', async ({ page }) => {
    await page.setContent(compliantLibrary);
    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });

  test('a signed-in library shell fails on contrast and target size', async ({
    page,
  }) => {
    await page.setContent(failingLibrary);
    const results = await scan(page);
    const ids = results.violations.map(violation => violation.id);
    expect(ids).toContain('color-contrast');
    expect(ids).toContain('target-size');
  });
});
