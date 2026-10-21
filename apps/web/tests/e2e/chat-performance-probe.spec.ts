import { expect, type Page, test } from '@playwright/test';
import {
  CONVERSATION_ID,
  mockChatBackend,
} from '../helpers/chat-performance-backend';
import { installBrowserChatProbe } from '../helpers/chat-performance-probe';

// These are browser probe contract tests, not authenticated product measurements.
async function mountFixture(page: Page, delay = 0, blocked = false) {
  await page.setContent(
    '<textarea aria-label="Chat Message Input"></textarea>'
  );
  await page.evaluate(
    ({ delay, blocked }) => {
      const composer = document.querySelector('textarea')!;
      composer.focus();
      composer.addEventListener('input', () => {
        if (blocked) return;
        if (delay) {
          const end = performance.now() + delay;
          while (performance.now() < end) {
            /* deterministic blocked handler */
          }
        }
        // Mirrors React's committed controlled textarea value; the probe itself
        // only sets value, which cannot prove that an input handler ran.
        composer.defaultValue = composer.value;
      });
    },
    { delay, blocked }
  );
  await page.evaluate(installBrowserChatProbe, {
    user: 'Sent',
    assistant: 'Reply',
  });
}

async function presentReply(page: Page) {
  await page.evaluate(() => {
    for (const [testId, text] of [
      ['chat-user-bubble', 'Sent'],
      ['chat-message-reply', 'Reply'],
    ]) {
      const row = document.createElement('div');
      row.dataset.testid = testId;
      row.textContent = text;
      document.body.append(row);
    }
  });
}

async function readTiming(page: Page) {
  await page.waitForFunction(
    () =>
      window.__jovieChatPerformanceProbe?.renderToInteractiveMs !== undefined
  );
  return page.evaluate(() => {
    const probe = window.__jovieChatPerformanceProbe!;
    return {
      usable: probe.usableStateMs!,
      interactive: probe.renderToInteractiveMs!,
      input: probe.nextInput!,
    };
  });
}

test.afterEach(async ({ page }) => {
  await page.evaluate(() => window.__jovieChatPerformanceProbe?.dispose());
});

test.describe('Chat performance probe paint and input contract', () => {
  test('reuses persisted fixtures and aborts an open deterministic stream without a live backend', async ({
    page,
  }) => {
    const backend = await mockChatBackend(page, true);
    await page.route('http://ratchet.test/', route =>
      route.fulfill({ contentType: 'text/html', body: '<main>Fixture</main>' })
    );
    await page.goto('http://ratchet.test/');
    const outcome = await page.evaluate(async conversationId => {
      const history = await fetch(
        `/api/chat/conversations/${conversationId}`
      ).then(response => response.json());
      window.__jovieHoldChatResponse = true;
      const abort = new AbortController();
      const response = await fetch('/api/chat', {
        method: 'POST',
        signal: abort.signal,
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              parts: [{ type: 'text', text: 'Performance message 1' }],
            },
          ],
        }),
      });
      const reader = response.body!.getReader();
      const first = await reader.read();
      const text = new TextDecoder().decode(first.value);
      abort.abort();
      const error = await reader.read().catch(error => error.name);
      return {
        historyCount: history.messages.length,
        presented: text.includes('Performance reply 1'),
        finished: text.includes('[DONE]'),
        error,
        released: window.__jovieReleaseChatResponse === undefined,
      };
    }, CONVERSATION_ID);
    expect(outcome).toEqual({
      historyCount: 2,
      presented: true,
      finished: false,
      error: 'AbortError',
      released: true,
    });
    backend.failNextSend();
    expect(
      await page.evaluate(() =>
        fetch('/api/chat', { method: 'POST' }).then(response => response.status)
      )
    ).toBe(503);
  });

  test('handles and presents the subsequent edit within the unchanged 50ms budget', async ({
    page,
  }) => {
    await mountFixture(page);
    await presentReply(page);
    const timing = await readTiming(page);
    expect(timing.usable).toBeGreaterThan(0);
    expect(timing.interactive).toBeGreaterThan(0);
    expect(timing.interactive).toBeLessThanOrEqual(50);
    expect(timing.input.presentedMs).toBeGreaterThanOrEqual(
      timing.input.handledMs
    );
    const composer = page.getByRole('textbox');
    await expect(composer).toHaveValue('Next message');
    await expect(composer).toBeFocused();
  });

  test('includes synchronous input-handler blocking in next-input latency', async ({
    page,
  }) => {
    await mountFixture(page, 120);
    await presentReply(page);
    const timing = await readTiming(page);
    expect(timing.input.handledMs).toBeGreaterThanOrEqual(120);
    expect(timing.interactive).toBeGreaterThan(50);
    expect(timing.interactive).toBeGreaterThanOrEqual(timing.input.presentedMs);
  });

  test('an enabled textarea whose handler ignores edits cannot count as interactive', async ({
    page,
  }) => {
    await mountFixture(page, 0, true);
    await presentReply(page);
    await page.waitForFunction(
      () => window.__jovieChatPerformanceProbe?.usableStateMs !== undefined
    );
    await expect(page.getByRole('textbox')).toHaveValue('Next message');
    expect(
      await page.evaluate(() => ({
        committed: document.querySelector('textarea')!.defaultValue,
        interactive: window.__jovieChatPerformanceProbe!.renderToInteractiveMs,
      }))
    ).toEqual({ committed: '', interactive: undefined });
    // Release the handler only after the real readiness budget has elapsed.
    await page.evaluate(
      () =>
        new Promise<void>(resolve =>
          setTimeout(() => {
            const composer = document.querySelector('textarea')!;
            composer.defaultValue = composer.value;
            resolve();
          }, 80)
        )
    );
    expect((await readTiming(page)).interactive).toBeGreaterThan(80);
  });

  test('includes time spent disabled after reply presentation', async ({
    page,
  }) => {
    await mountFixture(page);
    await page.getByRole('textbox').evaluate(element => {
      (element as HTMLTextAreaElement).disabled = true;
    });
    await presentReply(page);
    await page.waitForFunction(
      () => window.__jovieChatPerformanceProbe?.usableStateMs !== undefined
    );
    await page.evaluate(
      () =>
        new Promise<void>(resolve =>
          setTimeout(() => {
            document.querySelector('textarea')!.disabled = false;
            document.querySelector('textarea')!.focus();
            resolve();
          }, 80)
        )
    );
    expect((await readTiming(page)).interactive).toBeGreaterThan(80);
  });

  test('typing starts in the dispatch task and waits for committed presentation', async ({
    page,
  }) => {
    await mountFixture(page, 80);
    const timing = await page.evaluate(() =>
      window.__jovieChatPerformanceProbe!.edit('Typed draft')
    );
    expect(timing.handledMs).toBeGreaterThanOrEqual(80);
    expect(timing.presentedMs).toBeGreaterThan(timing.handledMs);
    await expect(page.getByRole('textbox')).toHaveValue('Typed draft');
    await expect(page.getByRole('textbox')).toBeFocused();
  });
});
