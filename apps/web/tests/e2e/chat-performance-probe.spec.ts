import { expect, test } from '@playwright/test';
import { installBrowserChatProbe } from '../helpers/chat-performance-probe';

type ProbeWindow = Window & {
  __jovieChatPerformanceProbe?: {
    usableStateMs?: number;
    renderToInteractiveMs?: number;
  };
};

test.describe('Chat performance probe paint and readiness contract', () => {
  test('records zero additional latency when the composer is already interactive at reply presentation', async ({
    page,
  }) => {
    await page.setContent(
      '<textarea aria-label="Chat Message Input"></textarea>'
    );
    await page.evaluate(installBrowserChatProbe, {
      user: 'Sent',
      assistant: 'Reply',
    });
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
    await page.waitForFunction(
      () =>
        (window as ProbeWindow).__jovieChatPerformanceProbe
          ?.renderToInteractiveMs !== undefined
    );
    const timing = await page.evaluate(() => {
      const probe = (window as ProbeWindow).__jovieChatPerformanceProbe!;
      return {
        usable: probe.usableStateMs,
        interactive: probe.renderToInteractiveMs,
      };
    });
    expect(timing.usable).toBeGreaterThan(0);
    expect(timing.interactive).toBe(0);
    const composer = page.getByRole('textbox', { name: 'Chat Message Input' });
    await composer.fill('Next message');
    await expect(composer).toHaveValue('Next message');
  });

  test('preserves a real composer delay above the unchanged 50ms budget', async ({
    page,
  }) => {
    await page.setContent(
      '<textarea aria-label="Chat Message Input" disabled></textarea>'
    );
    await page.evaluate(installBrowserChatProbe, {
      user: 'Sent',
      assistant: 'Reply',
    });
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
    await page.waitForFunction(
      () =>
        (window as ProbeWindow).__jovieChatPerformanceProbe?.usableStateMs !==
        undefined
    );
    expect(
      await page.evaluate(
        () =>
          (window as ProbeWindow).__jovieChatPerformanceProbe!
            .renderToInteractiveMs
      )
    ).toBeUndefined();
    await page.evaluate(
      () =>
        new Promise<void>(resolve => {
          setTimeout(() => {
            document.querySelector<HTMLTextAreaElement>('textarea')!.disabled =
              false;
            resolve();
          }, 80);
        })
    );
    await page.waitForFunction(
      () =>
        (window as ProbeWindow).__jovieChatPerformanceProbe
          ?.renderToInteractiveMs !== undefined
    );
    const delay = await page.evaluate(
      () =>
        (window as ProbeWindow).__jovieChatPerformanceProbe!
          .renderToInteractiveMs
    );
    expect(delay).toBeGreaterThanOrEqual(80);
    expect(delay).toBeGreaterThan(50);
  });
});
