import { expect, test } from '@playwright/test';
import {
  installScrollBackend,
  SCROLL_CONVERSATION_ID,
} from '../helpers/chat-scroll-backend';
import {
  collectScrollFrames,
  countMissedPresentationSlots,
} from '../helpers/chat-scroll-frames';

const selector = '[data-testid="chat-message-scroll"]';

async function mountScrollable(page: import('@playwright/test').Page) {
  await page.setContent(
    `<div data-testid="chat-message-scroll" style="height:240px;overflow:auto">${Array.from({ length: 100 }, (_, i) => `<div data-message-id="history-${String(i).padStart(6, '0')}" style="height:80px">Persisted ${i}</div>`).join('')}</div>`
  );
  await page.bringToFront();
}

test('browser collector measures movement and populated ordered rows across paint opportunities', async ({
  page,
}) => {
  await mountScrollable(page);
  const result = await page.evaluate(collectScrollFrames, {
    selector,
    direction: 'down' as const,
    frameCount: 8,
  });
  expect(result.samples).toHaveLength(9);
  expect(result.endTop).toBeGreaterThan(result.startTop);
  expect(result.distancePx).toBeGreaterThan(120);
  for (const ids of result.visibleIds) {
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toEqual([...ids].sort());
  }
  expect(
    countMissedPresentationSlots({
      profile: { refreshHz: 60, toleranceMs: 1 },
      samples: result.samples,
    }).intervalCount
  ).toBe(8);
});

test('rejects non-overflowing and invisible viewports', async ({ page }) => {
  for (const style of ['height:300px', 'height:0;overflow:hidden']) {
    await page.setContent(
      `<div data-testid="chat-message-scroll" style="${style}">Short</div>`
    );
    await expect(
      page.evaluate(collectScrollFrames, {
        selector,
        direction: 'down' as const,
        frameCount: 3,
      })
    ).rejects.toThrow('visible and overflow');
  }
});

test('rejects an overflowed viewport that does not move', async ({ page }) => {
  await mountScrollable(page);
  await page.locator(selector).evaluate(element => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(
    page.evaluate(collectScrollFrames, {
      selector,
      direction: 'down' as const,
      frameCount: 3,
    })
  ).rejects.toThrow('did not actually scroll');
});

test('rejects blank visible virtual windows', async ({ page }) => {
  await page.setContent(
    '<div data-testid="chat-message-scroll" style="height:240px;overflow:auto"><div style="height:8000px"></div></div>'
  );
  await expect(
    page.evaluate(collectScrollFrames, {
      selector,
      direction: 'down' as const,
      frameCount: 3,
    })
  ).rejects.toThrow('blank visible rows');
});

test('rejects partially empty or disconnected visible windows', async ({
  page,
}) => {
  for (const gap of [0, 80]) {
    await page.setContent(
      `<div data-testid="chat-message-scroll" style="height:240px;overflow:auto"><div data-message-id="history-000000" style="height:80px">First</div>${gap ? `<div style="height:${gap}px"></div><div data-message-id="history-000001" style="height:80px">Second</div>` : ''}<div style="height:8000px"></div></div>`
    );
    await expect(
      page.evaluate(collectScrollFrames, {
        selector,
        direction: 'down' as const,
        frameCount: 3,
      })
    ).rejects.toThrow(
      gap ? 'gap between visible rows' : 'does not fill the viewport'
    );
  }
});

test('invalidates background focus changes even when the page remains visible', async ({
  page,
}) => {
  await mountScrollable(page);
  await page.evaluate(() => {
    const original = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback =>
      original(timestamp => {
        window.dispatchEvent(new Event('blur'));
        callback(timestamp);
      });
  });
  await expect(
    page.evaluate(collectScrollFrames, {
      selector,
      direction: 'down' as const,
      frameCount: 3,
    })
  ).rejects.toThrow('hidden/background');
});

test('invalidates the whole run when visibility changes between frame callbacks', async ({
  page,
}) => {
  await mountScrollable(page);
  await page.evaluate(() => {
    const original = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback =>
      original(timestamp => {
        Object.defineProperty(document, 'visibilityState', {
          value: 'hidden',
          configurable: true,
        });
        document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'visibilityState', {
          value: 'visible',
          configurable: true,
        });
        callback(timestamp);
      });
  });
  await expect(
    page.evaluate(collectScrollFrames, {
      selector,
      direction: 'down' as const,
      frameCount: 3,
    })
  ).rejects.toThrow('hidden/background');
});

for (const count of [200, 2000] as const) {
  test(`backend serves all ${count} persisted messages exactly once through the product cursor`, async ({
    page,
  }) => {
    await installScrollBackend(page, count);
    await page.route('http://scroll-fixture.test/', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<body>Fixture transport</body>',
      })
    );
    await page.goto('http://scroll-fixture.test/');
    const ids: string[] = [];
    let before: string | undefined;
    for (let index = 0; index < count / 40; index += 1) {
      const params = new URLSearchParams({ limit: '40' });
      if (before) params.set('before', before);
      const response = await page.evaluate(
        async path => (await fetch(path)).json(),
        `/api/chat/conversations/${SCROLL_CONVERSATION_ID}?${params}`
      );
      expect(response.messages).toHaveLength(40);
      expect(response.hasMore).toBe(index < count / 40 - 1);
      before = response.messages[0].createdAt;
      ids.unshift(
        ...response.messages.map((message: { id: string }) => message.id)
      );
    }
    expect(new Set(ids).size).toBe(count);
    expect(ids).toEqual([...ids].sort());
    await page.evaluate(async () => {
      const response = await fetch('/api/chat', { method: 'POST', body: '{}' });
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let text = '';
      while (!text.includes('text-delta'))
        text += decoder.decode((await reader.read()).value);
      (
        window as Window & { __scrollStream?: { finish: () => void } }
      ).__scrollStream!.finish();
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        text += decoder.decode(chunk.value);
      }
      if (!text.includes('[DONE]'))
        throw new Error('Missing stream completion');
    });
  });
}
