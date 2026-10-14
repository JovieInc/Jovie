import { expect, test } from '@playwright/test';
import { inspectEssentialViewport } from './helpers/golden-path-keyframes';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('current-state essential actions (JOV-7771)', () => {
  test('deliberate red rejects independent clipping, obstruction, missing and duplicate actions', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent(
      '<button id="action" style="position:fixed;left:20px;top:20px;width:120px;height:44px">Continue</button>'
    );
    expect(await inspectEssentialViewport(page, ['#action'])).toEqual({
      supported: true,
      findings: [],
    });

    await page.locator('#action').evaluate(el => {
      el.style.top = '830px';
    });
    expect(
      (await inspectEssentialViewport(page, ['#action'])).findings
    ).toEqual([
      expect.objectContaining({ selector: '#action', reason: 'clipped' }),
    ]);
    await page.locator('#action').evaluate(el => {
      el.style.top = '20px';
    });
    await page.evaluate(() => {
      const cover = document.createElement('div');
      cover.id = 'cover';
      cover.style.cssText =
        'position:fixed;inset:0;z-index:10;background:white';
      document.body.append(cover);
    });
    expect(
      (await inspectEssentialViewport(page, ['#action'])).findings
    ).toEqual([expect.objectContaining({ reason: 'occluded' })]);
    await page.locator('#cover').evaluate(el => el.remove());
    await page.locator('#action').evaluate(el => el.after(el.cloneNode(true)));
    expect(
      (await inspectEssentialViewport(page, ['#action'])).findings
    ).toEqual([expect.objectContaining({ reason: 'duplicate' })]);
    expect(
      (await inspectEssentialViewport(page, ['#missing'])).findings
    ).toEqual([expect.objectContaining({ reason: 'missing' })]);
  });

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`claim handoff retains its essential composer at ${viewport.width}px after idle and reload`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      // Actual route: no auth, ownership, access, or provider bypass. These
      // assertions cover presentation even when verification cannot complete.
      await page.goto(
        '/start?starter_prompt=I+want+to+claim+jov.ie%2Fsam.&handle=sam'
      );
      for (const reload of [false, true]) {
        if (reload) await page.reload();
        const input = page.getByRole('textbox', {
          name: 'Chat message input',
          exact: false,
        });
        await expect(input).toBeVisible();
        await expect
          .poll(
            async () =>
              await inspectEssentialViewport(page, [
                '[aria-label="Chat message input" i]',
                'button[aria-label="Send message"]',
              ])
          )
          .toEqual({ supported: true, findings: [] });
        if ((await input.inputValue()) === '') {
          // Successful verification may already have submitted the starter.
          await expect(
            page
              .getByTestId('chat-user-bubble')
              .filter({ hasText: 'I want to claim jov.ie/sam.' })
          ).toHaveCount(1);
        } else {
          await expect(input).toHaveValue('I want to claim jov.ie/sam.');
        }
      }
    });
  }
});
