import { expect, type Locator, test } from '@playwright/test';
import { setTestAuthBypassSession } from '../helpers/clerk-auth';
import {
  chatComposerInputLocator,
  gotoAuthenticatedChatRoute,
} from './utils/smoke-test-utils';

const LAYOUT_TOLERANCE_PX = 1;

interface LayoutRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function readRect(locator: Locator): Promise<LayoutRect> {
  await expect(locator).toBeVisible();

  return locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  });
}

function expectStableRect(before: LayoutRect, after: LayoutRect) {
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(
      Math.abs(after[key] - before[key]),
      `Composer ${key} shifted from ${before[key]}px to ${after[key]}px`
    ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
  }
}

test.use({ storageState: { cookies: [], origins: [] } });

test('file drag stays passive and preserves composer geometry', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);

  await setTestAuthBypassSession(page, 'creator-ready');
  await gotoAuthenticatedChatRoute(page);

  const chat = page.getByTestId('chat-content');
  const composer = page.locator('.system-b-chat-composer-surface').first();
  const input = chatComposerInputLocator(page);

  await expect(chat).toBeVisible();
  await expect(input).toBeVisible();
  const beforeDrag = await readRect(composer);

  await chat.evaluate(element => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(
      new File(['visual-proof'], 'visual-proof.png', { type: 'image/png' })
    );
    element.dispatchEvent(
      new DragEvent('dragenter', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      })
    );
  });

  const dropStatus = page.getByRole('status', {
    name: 'Drop Files To Attach To This Thread',
  });
  await expect(dropStatus).toBeVisible();

  await expect
    .poll(() =>
      dropStatus.evaluate(element => {
        const style = getComputedStyle(element);
        return {
          pointerEvents: style.pointerEvents,
          backdropFilter: style.backdropFilter,
        };
      })
    )
    .toEqual({ pointerEvents: 'none', backdropFilter: 'none' });

  const duringDrag = await readRect(composer);
  expectStableRect(beforeDrag, duringDrag);

  const inputOwnsCenterPoint = await input.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );
    return hit === element || (hit !== null && element.contains(hit));
  });
  expect(inputOwnsCenterPoint).toBe(true);

  const screenshotPath = testInfo.outputPath(
    'chat-file-drop-transient-desktop.png'
  );
  await page.screenshot({
    animations: 'disabled',
    path: screenshotPath,
  });
  await testInfo.attach('chat-file-drop-transient-desktop', {
    path: screenshotPath,
    contentType: 'image/png',
  });

  await chat.evaluate(element => {
    element.dispatchEvent(
      new DragEvent('dragleave', {
        bubbles: true,
        cancelable: true,
        relatedTarget: document.body,
      })
    );
  });

  await expect(dropStatus).toBeHidden();
  expectStableRect(beforeDrag, await readRect(composer));
});
