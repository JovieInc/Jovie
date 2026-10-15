import { expect, type Page, test } from '@playwright/test';
import { inspectEssentialViewport } from './helpers/golden-path-keyframes';
import { installRuntimeAutomationBypass } from './utils/runtime-automation-bypass';

test.use({ storageState: { cookies: [], origins: [] } });

const prompt = 'I want to claim jov.ie/sam.';
const startUrl =
  '/start?starter_prompt=I+want+to+claim+jov.ie%2Fsam.&handle=sam';

async function draftProgress(page: Page) {
  const intro = page.locator(
    '[data-entry-mode="prompt_handoff"], [data-entry-mode="spotify_handoff"]'
  );
  return {
    liveRegions: await intro.getByRole('status').count(),
    sentClaims: (await intro.allTextContents()).filter(text =>
      text.includes('Your message is on its way.')
    ).length,
  };
}

async function expectEssentials(page: Page) {
  const selectors = [
    '[aria-label="Chat message input" i]',
    'button[aria-label="Send message"], button[aria-label="Stop generating"], button[aria-label="Interrupt and send"]',
  ];
  for (const selector of [
    '[data-testid="onboarding-empty-intro"] h1',
    '[data-testid="onboarding-flow-status"] [role="status"]',
    '[data-testid="onboarding-turnstile-widget-frame"][data-turnstile-mount="inline"]',
    '[data-onboarding-session] [role="alert"]',
  ]) {
    if (await page.locator(selector).isVisible()) selectors.push(selector);
  }
  expect(await inspectEssentialViewport(page, selectors)).toEqual({
    supported: true,
    findings: [],
  });
  expect(await draftProgress(page)).toEqual({ liveRegions: 0, sentClaims: 0 });
}

declare global {
  interface Window {
    __claimProviderFixture?: { interact: () => void; fail: () => void };
    __claimLayout?: { supported: boolean; total: number };
  }
}

test.describe('current-state essential actions (JOV-7771)', () => {
  test('deliberate red rejects redundant handoff progress even with valid action geometry', async ({
    page,
  }) => {
    await page.setContent(
      '<div data-entry-mode="prompt_handoff"><h1>Getting this ready</h1><p>Your message is on its way.</p><div role="status">Preparing your first message</div></div><button id="action" style="width:120px;height:44px">Continue</button>'
    );
    expect(await inspectEssentialViewport(page, ['#action'])).toEqual({
      supported: true,
      findings: [],
    });
    expect(await draftProgress(page)).toEqual({
      liveRegions: 1,
      sentClaims: 1,
    });
    await page.setContent(
      '<div data-entry-mode="prompt_handoff"><h1>Your first message</h1></div>'
    );
    expect(await draftProgress(page)).toEqual({
      liveRegions: 0,
      sentClaims: 0,
    });
  });

  test('allows hidden responsive alternatives and scrolling lists but refuses an unavailable viewport metric', async ({
    page,
  }) => {
    await page.setContent(
      '<div style="height:100px;overflow:auto"><p style="height:1200px">Legitimate transcript</p></div><button id="action" style="width:120px;height:44px">Continue</button><div hidden><button id="action">Compact alternative</button></div>'
    );
    expect(await inspectEssentialViewport(page, ['#action'])).toEqual({
      supported: true,
      findings: [],
    });
    await page.evaluate(() =>
      Object.defineProperty(window, 'visualViewport', {
        configurable: true,
        value: null,
      })
    );
    expect(await inspectEssentialViewport(page, ['#action'])).toEqual({
      supported: false,
      findings: [],
    });
  });

  test('delayed interactive verification and its failure retain reachable draft and recovery', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // Exercise actual verification, rather than CI's synthetic-principal
    // short circuit. This fixture opts OUT of the HTML automation bypass;
    // it grants no app auth/access and intercepts only the provider script.
    await page.addInitScript(() => {
      const requireVerification = () => {
        if (document.documentElement?.dataset.e2eMode === '1') {
          document.documentElement.dataset.e2eMode = '0';
        }
      };
      new MutationObserver(requireVerification).observe(document, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-e2e-mode'],
      });
      requireVerification();
    });
    await page.route(
      'https://challenges.cloudflare.com/turnstile/v0/api.js*',
      route =>
        route.fulfill({
          contentType: 'application/javascript',
          body: `window.turnstile = {
        render(target, options) {
          window.__claimProviderFixture = {
            interact() {
              const action = document.createElement('button');
              action.textContent = 'Verify fixture';
              action.style.cssText = 'width:180px;height:44px';
              target.replaceChildren(action);
              options['before-interactive-callback']();
            },
            fail() { options['error-callback']('controlled-fixture'); }
          };
          return 'claim-provider-fixture';
        }, remove() {}, reset() {}
      };`,
        })
    );
    await page.goto(startUrl);
    await expect
      .poll(() => page.evaluate(() => Boolean(window.__claimProviderFixture)))
      .toBe(true);
    await expectEssentials(page);
    await page.evaluate(() => window.__claimProviderFixture?.interact());
    await expect(
      page.getByTestId('onboarding-turnstile-widget-frame')
    ).toHaveAttribute('data-turnstile-mount', 'inline');
    await expectEssentials(page);
    await page.evaluate(() => window.__claimProviderFixture?.fail());
    // Next.js owns a separate, empty route-announcer alert outside this shell.
    const recoveryAlert = page.locator(
      '[data-onboarding-session] [role="alert"]'
    );
    await expect(recoveryAlert).toHaveCount(1);
    await expect(recoveryAlert).toBeVisible();
    await expectEssentials(page);
    await expect(
      page.getByRole('textbox', { name: 'Chat message input', exact: false })
    ).toHaveValue(prompt);
  });

  test('fresh handoff submits once and restored history never resends its starter', async ({
    page,
  }) => {
    // Presentation fixture only; real auth/provider acceptance stays in the
    // existing golden path. No ownership or access mutation occurs here.
    await page.addInitScript(installRuntimeAutomationBypass);
    await page.addInitScript(() => {
      const metric = {
        supported:
          typeof PerformanceObserver === 'function' &&
          PerformanceObserver.supportedEntryTypes.includes('layout-shift'),
        total: 0,
      };
      window.__claimLayout = metric;
      if (!metric.supported) return;
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            hadRecentInput: boolean;
            value: number;
          };
          if (!shift.hadRecentInput) metric.total += shift.value;
        }
      }).observe({ type: 'layout-shift' });
    });
    let releaseReply: () => void = () => {
      throw new Error('Reply fixture is not initialized');
    };
    const replyReady = new Promise<void>(resolve => {
      releaseReply = resolve;
    });
    let chatPosts = 0;
    await page.route('**/api/chat', async route => {
      if (route.request().method() === 'POST') chatPosts++;
      await replyReady;
      await route.fulfill({
        headers: {
          'content-type': 'text/event-stream',
          'x-vercel-ai-ui-message-stream': 'v1',
        },
        body: 'data: {"type":"start","messageId":"reply"}\n\ndata: {"type":"text-start","id":"reply-text"}\n\ndata: {"type":"text-delta","id":"reply-text","delta":"Your draft is saved."}\n\ndata: {"type":"text-end","id":"reply-text"}\n\ndata: {"type":"finish","finishReason":"stop"}\n\ndata: [DONE]\n\n',
      });
    });
    await page.goto(startUrl);
    await expect(
      page.getByTestId('chat-user-bubble').filter({ hasText: prompt })
    ).toHaveCount(1);
    await expect.poll(() => chatPosts).toBe(1);
    const input = page.getByRole('textbox', {
      name: 'Chat message input',
      exact: false,
    });
    const beforeReply = await input.boundingBox();
    await expectEssentials(page);
    expect(await page.evaluate(() => window.__claimLayout?.supported)).toBe(
      true
    );
    await page.evaluate(() => {
      if (window.__claimLayout) window.__claimLayout.total = 0;
    });
    releaseReply();
    await expect(page.getByText('Your draft is saved.')).toBeVisible();
    await page.evaluate(
      () =>
        new Promise<void>(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );
    expect(await page.evaluate(() => window.__claimLayout?.total)).toBe(0);
    const afterReply = await input.boundingBox();
    expect(beforeReply).not.toBeNull();
    expect(afterReply).not.toBeNull();
    if (beforeReply && afterReply)
      expect(Math.abs(afterReply.y - beforeReply.y)).toBeLessThanOrEqual(1);
    await expectEssentials(page);
    await page.route('**/api/onboarding/conversation', route =>
      route.fulfill({
        json: {
          identityId: null,
          conversationId: 'saved-claim-fixture',
          owned: false,
          messages: [
            {
              id: 'saved-user',
              role: 'user',
              parts: [{ type: 'text', text: prompt }],
            },
            {
              id: 'saved-reply',
              role: 'assistant',
              parts: [{ type: 'text', text: 'Your draft is saved.' }],
            },
          ],
        },
      })
    );
    await page.reload();
    await expect(page.getByText('Your draft is saved.')).toBeVisible();
    await expect(
      page.getByTestId('chat-user-bubble').filter({ hasText: prompt })
    ).toHaveCount(1);
    await page.waitForTimeout(1000); // Observe idle effects, not a response-time budget.
    expect(chatPosts).toBe(1);
  });

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
    { width: 768, height: 1024 },
    { width: 615, height: 407 },
  ]) {
    test(`claim handoff retains its essential composer at ${viewport.width}px after idle and reload`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      // Actual route: no auth, ownership, access, or provider bypass. These
      // assertions cover presentation even when verification cannot complete.
      await page.goto(startUrl);
      for (const reload of [false, true]) {
        if (reload) await page.reload();
        const input = page.getByRole('textbox', {
          name: 'Chat message input',
          exact: false,
        });
        await expect(input).toBeVisible();
        await expectEssentials(page);
        await page.waitForTimeout(1000); // A second idle sample must also pass.
        await expectEssentials(page);
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
