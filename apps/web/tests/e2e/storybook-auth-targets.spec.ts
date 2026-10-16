import { writeFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';

const controls =
  '[data-auth-provider-slot], [data-auth-shell-back], [aria-label="Go to homepage"], [data-auth-mode-switch] a, [data-auth-email-code-step] button';

async function geometry(page: Page) {
  return page.locator(controls).evaluateAll(elements =>
    elements.map(element => {
      const r = element.getBoundingClientRect();
      const pseudo = getComputedStyle(element, '::before');
      const size = (axis: 'width' | 'height', min: 'minWidth' | 'minHeight') =>
        pseudo.content === 'none'
          ? r[axis]
          : Math.max(
              r[axis],
              Number.parseFloat(pseudo[axis]),
              Number.parseFloat(pseudo[min]) || 0
            );
      const width = size('width', 'minWidth');
      const height = size('height', 'minHeight');
      return {
        name: element.getAttribute('aria-label') ?? element.textContent?.trim(),
        x: r.x + (r.width - width) / 2,
        y: r.y + (r.height - height) / 2,
        width,
        height,
        faceHeight: r.height,
      };
    })
  );
}

type ProbeEvent = {
  type: string;
  trusted: boolean;
  owner: string | null;
  x: number;
  y: number;
  identifier?: number;
};

async function installOwnershipProbe(page: Page) {
  await page.evaluate(() => {
    for (const type of ['touchstart', 'touchend', 'click']) {
      document.addEventListener(
        type,
        event => {
          const control = (event.target as Element).closest('button,a');
          const owner = control
            ? (control.getAttribute('data-probe-owner') ??
              `unregistered:${control.tagName}`)
            : null;
          const touch =
            'changedTouches' in event
              ? (event as TouchEvent).changedTouches.item(0)
              : null;
          const pointer = event as MouseEvent;
          const events = JSON.parse(
            document.documentElement.dataset.authProbeEvents ?? '[]'
          );
          events.push({
            type: event.type,
            trusted: event.isTrusted,
            owner,
            x: touch?.clientX ?? pointer.clientX,
            y: touch?.clientY ?? pointer.clientY,
            identifier: touch?.identifier,
          });
          document.documentElement.dataset.authProbeEvents =
            JSON.stringify(events);
          if (event.type === 'click') {
            document.documentElement.dataset.authOwner = owner ?? 'whitespace';
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        },
        { capture: true, passive: type !== 'click' }
      );
    }
  });
}

async function expectOwnedActivation(
  page: Page,
  activate: (x: number, y: number) => Promise<void>,
  x: number,
  y: number,
  expectedOwner: string,
  options: { timeout?: number; touch?: boolean } = {}
) {
  await page.evaluate(() => {
    delete document.documentElement.dataset.authOwner;
    document.documentElement.dataset.authProbeEvents = '[]';
  });
  const point = await page.evaluate(
    ({ x, y }) => {
      const hit = document.elementFromPoint(x, y);
      const control = hit?.closest('button,a');
      return {
        x,
        y,
        viewport: [innerWidth, innerHeight],
        scroll: [scrollX, scrollY],
        hit: hit?.tagName,
        disabledFieldset: Boolean(hit?.closest('fieldset:disabled')),
        owner: control
          ? (control.getAttribute('data-probe-owner') ?? 'unregistered-control')
          : null,
      };
    },
    { x, y }
  );
  if (expectedOwner === 'whitespace') {
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(point.viewport[0]);
    expect(y).toBeLessThan(point.viewport[1]);
    expect(point.owner, 'gap is free of controls').toBeNull();
  }
  await activate(x, y);
  try {
    if (options.touch) {
      const events: ProbeEvent[] = JSON.parse(
        (await page.locator('html').getAttribute('data-auth-probe-events')) ??
          '[]'
      );
      const starts = events.filter(event => event.type === 'touchstart');
      const ends = events.filter(event => event.type === 'touchend');
      expect(starts, 'fresh native touch sequence').toHaveLength(1);
      expect(ends, 'fresh native touch sequence').toHaveLength(1);
      expect(starts[0].trusted).toBe(true);
      expect(ends[0].trusted).toBe(true);
      expect(ends[0].identifier).toBe(starts[0].identifier);
      expect(Math.abs(ends[0].x - x)).toBeLessThanOrEqual(1);
      expect(Math.abs(ends[0].y - y)).toBeLessThanOrEqual(1);
    }
    if (expectedOwner !== 'whitespace' || !options.touch) {
      await expect(
        page.locator('html'),
        'fresh native activation must set data-auth-owner'
      ).toHaveAttribute(
        'data-auth-owner',
        expectedOwner,
        options.timeout === undefined ? {} : { timeout: options.timeout }
      );
    }
    // Let compatibility clicks settle; a cancelled inert touch may have none.
    await page.evaluate(
      () =>
        new Promise<void>(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );
    const events: ProbeEvent[] = JSON.parse(
      (await page.locator('html').getAttribute('data-auth-probe-events')) ??
        '[]'
    );
    const clicks = events.filter(event => event.type === 'click');
    expect(clicks.every(event => event.trusted)).toBe(true);
    if (expectedOwner === 'whitespace') {
      expect(
        clicks.filter(event => event.owner !== null),
        'no gap control activation'
      ).toEqual([]);
    } else {
      expect(
        clicks.map(event => event.owner),
        'one matching control activation'
      ).toEqual([expectedOwner]);
    }
  } catch (error) {
    if (options.timeout === undefined) {
      const events = await page
        .locator('html')
        .getAttribute('data-auth-probe-events');
      const evidence = {
        touch: options.touch ?? false,
        expectedOwner,
        point,
        events,
      };
      console.log('native activation diagnostic', JSON.stringify(evidence));
      await test.info().attach('native-activation-diagnostic.json', {
        body: JSON.stringify(evidence),
        contentType: 'application/json',
      });
      await test.info().attach('native-activation-diagnostic.png', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    }
    throw error;
  }
}

async function textClipping(page: Page, selector: string) {
  return page.locator(selector).evaluateAll(elements => {
    const failures: {
      text: string;
      reason: string;
      rect: object;
      clip: object;
    }[] = [];
    const outside = (
      rect: DOMRect,
      clip: { left: number; right: number; top: number; bottom: number },
      x = true,
      y = true
    ) =>
      (x && (rect.left < clip.left - 1 || rect.right > clip.right + 1)) ||
      (y && (rect.top < clip.top - 1 || rect.bottom > clip.bottom + 1));
    for (const element of elements) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (
          !node.textContent?.trim() ||
          !parent ||
          parent.closest(
            '.sr-only,[aria-hidden="true"],[hidden],script,style'
          ) ||
          !parent.checkVisibility({
            checkOpacity: true,
            checkVisibilityCSS: true,
          })
        )
          continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const owner = parent.closest('button,a,label') ?? parent;
        const ownerBox = owner.getBoundingClientRect();
        for (const rect of range.getClientRects()) {
          if (rect.width === 0 || rect.height === 0) continue;
          const text = node.textContent.trim();
          const viewport = {
            left: 0,
            top: 0,
            right: innerWidth,
            bottom: innerHeight,
          };
          if (outside(rect, viewport))
            failures.push({
              text,
              reason: 'glyph outside viewport',
              rect: rect.toJSON(),
              clip: viewport,
            });
          if (outside(rect, ownerBox))
            failures.push({
              text,
              reason: 'glyph outside text owner',
              rect: rect.toJSON(),
              clip: ownerBox.toJSON(),
            });
          for (
            let ancestor: HTMLElement | null = parent;
            ancestor;
            ancestor = ancestor.parentElement
          ) {
            const style = getComputedStyle(ancestor);
            const clipX = /^(hidden|clip|auto|scroll)$/.test(style.overflowX);
            const clipY = /^(hidden|clip|auto|scroll)$/.test(style.overflowY);
            if (!clipX && !clipY) continue;
            const box = ancestor.getBoundingClientRect();
            const scaleX = ancestor.offsetWidth
              ? box.width / ancestor.offsetWidth
              : 1;
            const scaleY = ancestor.offsetHeight
              ? box.height / ancestor.offsetHeight
              : 1;
            const left = box.left + ancestor.clientLeft * scaleX;
            const top = box.top + ancestor.clientTop * scaleY;
            const clip = {
              left,
              top,
              right: left + ancestor.clientWidth * scaleX,
              bottom: top + ancestor.clientHeight * scaleY,
            };
            if (outside(rect, clip, clipX, clipY))
              failures.push({
                text,
                reason: 'glyph clipped by ancestor',
                rect: rect.toJSON(),
                clip,
              });
          }
        }
      }
    }
    return failures;
  });
}

async function proveVisibleText(
  page: Page,
  options: { timeout?: number } = {}
) {
  const shell = page.locator('[data-auth-shell]');
  await expect(shell).toHaveCount(1);
  const assertionOptions =
    options.timeout === undefined ? {} : { timeout: options.timeout };
  const legal = shell.locator('[data-auth-legal-copy]');
  await expect(legal, 'auth legal copy cardinality').toHaveCount(
    1,
    assertionOptions
  );
  await expect(legal, 'auth legal copy visibility').toBeVisible(
    assertionOptions
  );
  await expect(legal.locator('a'), 'auth legal link cardinality').toHaveCount(
    2,
    assertionOptions
  );
  for (const name of ['Terms of Service', 'Privacy Policy']) {
    const link = legal.getByRole('link', { name, exact: true });
    await expect(link, 'auth legal named link cardinality').toHaveCount(
      1,
      assertionOptions
    );
    await expect(link, 'auth legal named link visibility').toBeVisible(
      assertionOptions
    );
  }

  for (const required of [
    legal,
    legal.getByRole('link', { name: 'Terms of Service', exact: true }),
    legal.getByRole('link', { name: 'Privacy Policy', exact: true }),
  ]) {
    await expect
      .poll(
        () =>
          required.evaluate(
            element =>
              !element.closest(
                '.sr-only,[aria-hidden="true"],[hidden],script,style'
              ) &&
              element.checkVisibility({
                checkOpacity: true,
                checkVisibilityCSS: true,
              })
          ),
        { ...assertionOptions, message: 'auth legal rendered text eligibility' }
      )
      .toBe(true);
  }
  const count = await shell.evaluate(element => {
    const parents = new Set<HTMLElement>();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (
        node.textContent?.trim() &&
        parent &&
        !parent.closest(
          '.sr-only,[aria-hidden="true"],[hidden],script,style'
        ) &&
        parent.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      )
        parents.add(parent);
    }
    [...parents].forEach((parent, index) =>
      parent.setAttribute('data-auth-text-probe', String(index))
    );
    return parents.size;
  });
  expect(count, 'visible auth text was enumerated').toBeGreaterThan(0);
  for (let index = 0; index < count; index++) {
    const selector = `[data-auth-text-probe="${index}"]`;
    const parent = page.locator(selector);
    await parent.scrollIntoViewIfNeeded();
    const failures = await textClipping(page, selector);
    if (failures.length > 0) {
      const screenshotPath = test
        .info()
        .outputPath('text-clipping-failure.png');
      await page.screenshot({ path: screenshotPath, fullPage: true });
      await test.info().attach('text-clipping-failure.png', {
        path: screenshotPath,
        contentType: 'image/png',
      });
      const evidencePath = test.info().outputPath('text-clipping-failure.json');
      await writeFile(evidencePath, JSON.stringify({ index, failures }));
      await test.info().attach('text-clipping-failure.json', {
        path: evidencePath,
        contentType: 'application/json',
      });
    }
    expect(failures, `visible auth text ${index}`).toEqual([]);
  }
  for (const field of await shell.locator('input:not([type="hidden"])').all()) {
    await field.scrollIntoViewIfNeeded();
    await expect(field).toBeInViewport({ ratio: 1 });
  }
}

async function proveTargets(page: Page) {
  const boxes = await geometry(page);
  const viewport = page.viewportSize()!;
  for (const a of boxes) {
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(a.x + a.width).toBeLessThanOrEqual(viewport.width);
    expect(
      Math.min(a.width, a.height),
      `${a.name} target`
    ).toBeGreaterThanOrEqual(44);
    for (const b of boxes) {
      if (a === b) continue;
      const dx = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const dy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      expect(dx <= 0 || dy <= 0, `${a.name}/${b.name}`).toBe(true);
    }
  }
  await installOwnershipProbe(page);
  const mouse = page.mouse.click.bind(page.mouse);
  const tap = page.touchscreen.tap.bind(page.touchscreen);
  const actions = await page.locator(controls).all();
  for (const [index, action] of actions.entries()) {
    await action.evaluate(
      (element, id) => element.setAttribute('data-probe-owner', String(id)),
      index
    );
    await action.scrollIntoViewIfNeeded();
    if (!(await action.isEnabled())) continue;
    await page.keyboard.press('Tab');
    await action.focus();
    expect(
      await action.evaluate(
        element =>
          element.matches(':focus-visible') &&
          getComputedStyle(element).boxShadow !== 'none'
      )
    ).toBe(true);
    const r = (await geometry(page))[index];
    for (const y of [r.y + 1, r.y + r.height - 1]) {
      for (const activate of [mouse, tap]) {
        await expectOwnedActivation(
          page,
          activate,
          r.x + r.width / 2,
          y,
          String(index),
          { touch: activate === tap }
        );
      }
    }
    expect(
      await action.evaluate(element => {
        const range = document.createRange();
        range.selectNodeContents(element.querySelector('span') ?? element);
        const label = range.getBoundingClientRect();
        const r = element.getBoundingClientRect();
        return (
          label.width <= r.width + 1 &&
          label.height <= r.height + 1 &&
          element.scrollWidth <= element.clientWidth + 1
        );
      }),
      'labels fit'
    ).toBe(true);
  }
  // Both adjacent provider and adjacent recovery actions leave inert whitespace.
  for (const selector of [
    '[data-auth-provider-slot]',
    '[data-auth-email-code-step="code"] button:not([type="submit"])',
  ]) {
    const pair = page.locator(selector);
    if ((await pair.count()) !== 2) continue;
    await pair.first().scrollIntoViewIfNeeded();
    const a = (await pair.nth(0).boundingBox())!;
    const b = (await pair.nth(1).boundingBox())!;
    const vertical = a.y + a.height <= b.y;
    for (const fraction of [0.25, 0.5, 0.75]) {
      const x = vertical
        ? a.x + a.width * fraction
        : a.x + a.width + (b.x - a.x - a.width) * fraction;
      const y = vertical
        ? a.y + a.height + (b.y - a.y - a.height) * fraction
        : a.y + a.height / 2;
      for (const activate of [mouse, tap]) {
        await expectOwnedActivation(page, activate, x, y, 'whitespace', {
          touch: activate === tap,
        });
      }
    }
  }
}

for (const width of [320, 390, 768, 1440]) {
  test.describe(`${width}px auth targets`, () => {
    test.use({
      viewport: { width, height: 900 },
      isMobile: width < 768,
      hasTouch: true,
    });
    test('targets, ownership, focus and text scaling', async ({
      page,
    }, testInfo) => {
      for (const scale of [1, 2]) {
        for (const step of ['email', 'code']) {
          await page.goto(
            '/iframe.html?id=auth-authshell--claim-targets&viewMode=story'
          );
          await expect(
            page.locator('[data-auth-provider-slot]').first()
          ).toBeEnabled();
          await page.evaluate(async () => {
            const face = new FontFace(
              'Inter Variable',
              'url("/fonts/Inter-Latin.woff2")',
              { weight: '100 900' }
            );
            document.fonts.add(await face.load());
            await document.fonts.ready;
          });
          if (step === 'code') {
            // Presentation fixture through Storybook's existing API seam; no emails sent.
            await page.evaluate(() =>
              Object.assign(window, {
                __jovieApiMock: () => Response.json({ success: true }),
              })
            );
            await page.clock.install();
            await page
              .getByLabel('Email', { exact: true })
              .fill('e2e+targets@example.com');
            await page
              .getByRole('button', { name: 'Send sign-in code' })
              .click();
            await expect(
              page.locator('[data-auth-email-code-step]')
            ).toHaveAttribute('data-auth-email-code-step', 'code');
            const change = page.getByRole('button', { name: 'Change email' });
            const before = await change.boundingBox();
            await page.clock.runFor(31_000);
            await expect(
              page.getByRole('button', { name: 'Resend Verification Code' })
            ).toBeEnabled();
            expect(await change.boundingBox()).toEqual(before);
          }
          // Text-only scaling keeps layout spacing fixed, including pixel-based text tokens.
          await page.evaluate(scale => {
            const styles = [
              ...document.querySelectorAll<HTMLElement>('[data-auth-shell] *'),
            ].map(
              element =>
                [
                  element,
                  getComputedStyle(element).fontSize,
                  getComputedStyle(element).lineHeight,
                ] as const
            );
            for (const [element, size, lineHeight] of styles) {
              element.style.fontSize = `${Number.parseFloat(size) * scale}px`;
              element.style.lineHeight = `${Number.parseFloat(lineHeight) * scale}px`;
            }
          }, scale);
          const screenshotPath = testInfo.outputPath(`${step}-${scale}x.png`);
          await page.screenshot({ path: screenshotPath, fullPage: true });
          await testInfo.attach(`${step}-${scale}x.png`, {
            path: screenshotPath,
            contentType: 'image/png',
          });
          const geometryPath = testInfo.outputPath(`${step}-${scale}x.json`);
          await writeFile(geometryPath, JSON.stringify(await geometry(page)));
          await testInfo.attach(`${step}-${scale}x.json`, {
            path: geometryPath,
            contentType: 'application/json',
          });
          await proveTargets(page);
          await proveVisibleText(page);
          if (step === 'email' && scale === 1) {
            const cta = page.getByRole('button', { name: 'Send sign-in code' });
            expect((await cta.boundingBox())?.height).toBe(28);
          }
        }
      }
    });
  });
}

test.describe('auth ownership oracle', () => {
  test.use({ viewport: { width: 390, height: 900 }, hasTouch: true });
  test.beforeEach(async ({ page }) => {
    await page.setContent(
      '<button data-probe-owner="0" style="position:absolute;left:20px;top:20px;width:100px;height:80px">Action</button>'
    );
    await installOwnershipProbe(page);
  });

  test('rejects missing control click after mouse click', async ({ page }) => {
    await expectOwnedActivation(
      page,
      page.mouse.click.bind(page.mouse),
      60,
      60,
      '0'
    );
    await page.evaluate(() =>
      document.addEventListener('touchend', event => event.preventDefault(), {
        capture: true,
        passive: false,
      })
    );
    await expect(
      expectOwnedActivation(
        page,
        page.touchscreen.tap.bind(page.touchscreen),
        60,
        60,
        '0',
        { timeout: 500, touch: true }
      )
    ).rejects.toThrow(/data-auth-owner/);
  });

  test('accepts a fresh enabled control tap', async ({ page }) => {
    await expectOwnedActivation(
      page,
      page.mouse.click.bind(page.mouse),
      60,
      60,
      '0'
    );
    await expectOwnedActivation(
      page,
      page.touchscreen.tap.bind(page.touchscreen),
      60,
      60,
      '0',
      { touch: true }
    );
  });

  test('accepts delivered inert touch without compatibility click', async ({
    page,
  }) => {
    await expectOwnedActivation(
      page,
      page.mouse.click.bind(page.mouse),
      250,
      250,
      'whitespace'
    );
    await page.evaluate(() =>
      document.addEventListener('touchend', event => event.preventDefault(), {
        capture: true,
        passive: false,
      })
    );
    await expectOwnedActivation(
      page,
      page.touchscreen.tap.bind(page.touchscreen),
      250,
      250,
      'whitespace',
      { timeout: 500, touch: true }
    );
  });

  test('rejects missing whitespace touch delivery after mouse click', async ({
    page,
  }) => {
    await expectOwnedActivation(
      page,
      page.mouse.click.bind(page.mouse),
      250,
      250,
      'whitespace'
    );
    await page.evaluate(() => {
      for (const type of ['touchstart', 'touchend']) {
        window.addEventListener(
          type,
          event => {
            event.preventDefault();
            event.stopImmediatePropagation();
          },
          { capture: true, passive: false }
        );
      }
    });
    await expect(
      expectOwnedActivation(
        page,
        page.touchscreen.tap.bind(page.touchscreen),
        250,
        250,
        'whitespace',
        { timeout: 500, touch: true }
      )
    ).rejects.toThrow(/fresh native touch sequence/);
  });

  test('rejects an unregistered control as an inert gap', async ({ page }) => {
    await page
      .locator('button')
      .evaluate(element => element.removeAttribute('data-probe-owner'));
    await expect(
      expectOwnedActivation(
        page,
        page.mouse.click.bind(page.mouse),
        60,
        60,
        'whitespace'
      )
    ).rejects.toThrow(/gap is free of controls/);
  });
});

test.describe('auth text clipping oracle', () => {
  test.use({ viewport: { width: 390, height: 900 } });
  test('rejects glyphs displaced outside the control', async ({ page }) => {
    await page.setContent(
      '<button id="probe" style="position:absolute;left:100px;top:20px;width:160px;height:44px;overflow:visible"><span style="position:absolute;left:-36px;top:10px">Clipped label</span></button>'
    );
    const failures = await textClipping(page, '#probe');
    expect(failures).toContainEqual(
      expect.objectContaining({ reason: 'glyph outside text owner' })
    );
    expect(failures).not.toContainEqual(
      expect.objectContaining({ reason: 'glyph outside viewport' })
    );
  });
  test('rejects text clipped by an ancestor', async ({ page }) => {
    await page.setContent(
      '<div style="position:absolute;left:20px;top:20px;width:50px;height:60px;overflow:hidden"><button id="probe" style="width:160px;height:44px"><span>Action</span></button></div>'
    );
    expect(await textClipping(page, '#probe')).not.toEqual([]);
  });
  test('accepts fully visible wrapped text', async ({ page }) => {
    await page.setContent(
      '<div id="probe" style="position:absolute;left:20px;top:20px;width:160px;min-height:80px;line-height:20px"><span>Visible words wrap onto another line safely.</span></div>'
    );
    expect(await textClipping(page, '#probe')).toEqual([]);
  });
});

test.describe('auth text clipping oracle legal presence', () => {
  test.use({ viewport: { width: 390, height: 900 } });
  test.beforeEach(async ({ page }) => {
    await page.setContent(
      '<main data-auth-shell><h1>Claim @example</h1><label>Email<input type="email"></label><p data-auth-legal-copy>By signing up, you agree to our <span data-auth-legal-links><a href="/legal/terms">Terms of Service</a> and <a href="/legal/privacy">Privacy Policy</a>.</span></p></main>'
    );
  });
  test('rejects a removed legal link', async ({ page }) => {
    await page
      .getByRole('link', { name: 'Privacy Policy', exact: true })
      .evaluate(element => element.remove());
    await expect(proveVisibleText(page, { timeout: 500 })).rejects.toThrow(
      /auth legal/
    );
  });
  test('rejects hidden legal copy', async ({ page }) => {
    await page
      .locator('[data-auth-legal-copy]')
      .evaluate(element => element.setAttribute('hidden', ''));
    await expect(proveVisibleText(page, { timeout: 500 })).rejects.toThrow(
      /auth legal/
    );
  });
  for (const target of ['copy', 'link']) {
    for (const treatment of ['transparent', 'screen-reader-only']) {
      test(`rejects ${treatment} legal ${target}`, async ({ page }) => {
        await page.addStyleTag({
          content:
            '.sr-only { position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0 }',
        });
        const required =
          target === 'copy'
            ? page.locator('[data-auth-legal-copy]')
            : page.getByRole('link', { name: 'Privacy Policy', exact: true });
        await required.evaluate((element, treatment) => {
          if (treatment === 'transparent')
            (element as HTMLElement).style.opacity = '0';
          else element.classList.add('sr-only');
        }, treatment);
        await expect(proveVisibleText(page, { timeout: 500 })).rejects.toThrow(
          /auth legal/
        );
      });
    }
  }
});
