import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const focusCss = readFileSync(join(process.cwd(), 'styles/focus.css'), 'utf8');

// Browser fixture for the shared stylesheet, independent of auth and app data.
// Native :focus-visible and outline geometry cannot be proved by jsdom.
async function mount(page: import('@playwright/test').Page, content: string) {
  await page.setContent(`<style>
    :root { --color-focus-ring: CanvasText; }
    body { padding: 24px; }
    button, a, input { display: block; border-radius: 999px; padding: 8px; }
    [data-focus-container], .composite-field { padding: 8px; border-radius: 16px; }
    .overflow-hidden { overflow: hidden; width: 160px; }
    ${focusCss}
  </style>${content}`);
}

async function indicators(page: import('@playwright/test').Page) {
  return page.locator('body *').evaluateAll(elements =>
    elements
      .filter(element => {
        const style = getComputedStyle(element);
        return (
          style.outlineStyle !== 'none' &&
          Number.parseFloat(style.outlineWidth) > 0
        );
      })
      .map(element => element.id)
  );
}

test('pointer buttons stay quiet; keyboard focus follows the pill inside clipping containers', async ({
  page,
}) => {
  await mount(
    page,
    '<div class="overflow-hidden"><button id="pill">Continue</button></div>'
  );
  const pill = page.getByRole('button', { name: 'Continue' });
  await pill.click();
  expect(await indicators(page)).toEqual([]);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(pill).toBeFocused();
  expect(await indicators(page)).toEqual(['pill']);
  const geometry = await pill.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      width: style.outlineWidth,
      offset: style.outlineOffset,
      radius: style.borderRadius,
    };
  });
  expect(geometry).toEqual({ width: '2px', offset: '-2px', radius: '999px' });
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`only the innermost explicit container paints focus (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await mount(
      page,
      '<div id="outer" data-focus-container><div id="inner" data-focus-container><button id="action">Continue</button></div></div>'
    );
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button')).toBeFocused();
    expect(await indicators(page)).toEqual(['inner']);
  });
}

test('a nested composite field owns text focus even inside an explicit container', async ({
  page,
}) => {
  await mount(
    page,
    '<div id="outer" data-focus-container><div id="field" class="composite-field"><input aria-label="Name" /></div></div>'
  );
  await page.keyboard.press('Tab');
  await expect(page.getByRole('textbox', { name: 'Name' })).toBeFocused();
  expect(await indicators(page)).toEqual(['field']);
});

for (const owner of ['class="composite-field"', 'data-focus-container']) {
  test(`field ownership keeps its entire outline inside clipping edges (${owner})`, async ({
    page,
  }) => {
    await mount(
      page,
      `<div class="overflow-hidden"><div id="field" ${owner}><input aria-label="Name" /></div></div>`
    );
    await page.keyboard.press('Tab');
    expect(await indicators(page)).toEqual(['field']);
    await expect(page.locator('#field')).toHaveCSS('outline-offset', '-2px');
  });
}

test('a hidden radio gives its nearest visible container one keyboard indicator', async ({
  page,
}) => {
  await mount(
    page,
    '<div id="outer" data-focus-container><label id="choice" data-focus-container><input type="radio" aria-label="Artist" style="position:absolute;clip-path:inset(50%);width:1px;height:1px" />Artist</label></div>'
  );
  await page.keyboard.press('Tab');
  await expect(page.getByRole('radio', { name: 'Artist' })).toBeFocused();
  expect(await indicators(page)).toEqual(['choice']);
});

test('a focusable explicit container owns its own focus', async ({ page }) => {
  await mount(
    page,
    '<div id="outer" data-focus-container><div id="inner" data-focus-container tabindex="0">Choice</div></div>'
  );
  await page.keyboard.press('Tab');
  expect(await indicators(page)).toEqual(['inner']);
});

test('a visibility wrapper does not take focus from its button', async ({
  page,
}) => {
  await mount(
    page,
    '<div id="reveal" class="focus-within:opacity-100"><button id="action">Continue</button></div>'
  );
  await page.keyboard.press('Tab');
  expect(await indicators(page)).toEqual(['action']);
});

test('keyboard focus remains visible in forced colors', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await mount(page, '<button id="action">Continue</button>');
  await page.keyboard.press('Tab');
  expect(await indicators(page)).toEqual(['action']);
});
