import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { inspectEssentialViewport } from './helpers/golden-path-keyframes';
import { installRuntimeAutomationBypass } from './utils/runtime-automation-bypass';
import {
  installDelayedGuidanceLayoutProbe,
  installReplyLayoutProbe,
} from './utils/start-entry-layout';

test.use({ storageState: { cookies: [], origins: [] } });

const prompt = 'I want to claim jov.ie/sam.';
const startUrl =
  '/start?starter_prompt=I+want+to+claim+jov.ie%2Fsam.&handle=sam';

function expectZeroLayoutShift(
  metric:
    | {
        supported: boolean;
        total: number | null;
        entries?: readonly unknown[];
      }
    | undefined,
  testInfo: TestInfo
) {
  expect(metric).toBeDefined();
  expect(typeof metric!.supported).toBe('boolean');
  if (metric!.supported) {
    expect(Number.isFinite(metric!.total)).toBe(true);
    if (metric!.entries) {
      expect(
        metric!.total,
        `layout-shift entries ${JSON.stringify(metric!.entries)}`
      ).toBe(0);
    } else {
      expect(metric!.total).toBe(0);
    }
  } else {
    expect(metric!.total).toBeNull();
    testInfo.annotations.push({
      type: 'layout-shift',
      description:
        'API unavailable; essential-control geometry remains required',
    });
  }
}

async function readReplyLayout(page: Page) {
  return page.evaluate(() => {
    const metric = window.__claimLayout;
    if (!metric) return undefined;
    return {
      supported: metric.supported,
      total: metric.total,
      entries: window.__claimLayoutEntries ?? [],
    };
  });
}

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

async function installControlledVerification(page: Page) {
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
}

declare global {
  interface Window {
    __claimProviderFixture?: { interact: () => void; fail: () => void };
  }
}

test.describe('current-state essential actions (JOV-7771)', () => {
  for (const viewport of [
    { width: 1440, height: 900, fontSize: 12 },
    { width: 390, height: 844, fontSize: 12 },
    { width: 768, height: 1024, fontSize: 12 },
    { width: 390, height: 615, fontSize: 12 },
    { width: 615, height: 407, fontSize: 12 },
    { width: 390, height: 844, fontSize: 24 },
    { width: 390, height: 615, fontSize: 24 },
    { width: 1440, height: 900, fontSize: 32 },
    { width: 390, height: 844, fontSize: 32 },
  ]) {
    test(`delayed verification guidance stays stable at ${viewport.width}x${viewport.height} with ${viewport.fontSize}px text`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await installControlledVerification(page);
      await page.addInitScript(
        installDelayedGuidanceLayoutProbe,
        viewport.fontSize
      );
      await page.goto(startUrl);
      await expect
        .poll(() => page.evaluate(() => Boolean(window.__claimProviderFixture)))
        .toBe(true);
      await expect
        .poll(() =>
          page.evaluate(() => Boolean(window.__claimInitialLayout?.first))
        )
        .toBe(true);
      expect(
        await page.evaluate(() => window.__claimInitialLayout?.unguidedFirst)
      ).toBe(true);
      await expect(page.locator('#claim-delay-guidance')).toHaveCount(1);
      await page.evaluate(() =>
        document.querySelector('#claim-delay-guidance')?.remove()
      );
      await expect
        .poll(() =>
          page.evaluate(() => Boolean(window.__claimInitialLayout?.guided))
        )
        .toBe(true);
      await page.evaluate(
        () =>
          new Promise<void>(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      );
      const metric = await page.evaluate(() => window.__claimInitialLayout);
      expectZeroLayoutShift(metric, testInfo);
      expect(metric?.first).toHaveLength(4);
      expect(metric?.guided).toHaveLength(4);
      for (let index = 0; index < 4; index++) {
        expect(
          Math.abs(metric!.first![index]! - metric!.guided![index]!)
        ).toBeLessThanOrEqual(1);
      }
      await expectEssentials(page);
      await expect(
        page.getByRole('textbox', { name: 'Chat message input', exact: false })
      ).toHaveValue(prompt);
      const heading = await page
        .locator('[data-testid="onboarding-empty-intro"] h1')
        .boundingBox();
      const guidance = await page
        .locator('[data-testid="onboarding-flow-status"] > p[role="status"]')
        .boundingBox();
      expect(heading).not.toBeNull();
      expect(guidance).not.toBeNull();
      expect(heading!.y + heading!.height).toBeLessThanOrEqual(guidance!.y);
    });
  }

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
    await installControlledVerification(page);
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
  }, testInfo) => {
    // Presentation fixture only; real auth/provider acceptance stays in the
    // existing golden path. No ownership or access mutation occurs here.
    await page.addInitScript(installRuntimeAutomationBypass);
    await page.addInitScript(installReplyLayoutProbe);
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
    // The starter handoff has settled. Open the zero-CLS window here so
    // navigation and handoff entries stay outside it, including entries the
    // observer delivers late. Shifts from this moment through the reply still
    // have to total 0.
    await page.evaluate(() => window.__armClaimLayout?.());
    await page.evaluate(
      () =>
        new Promise<void>(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );
    expectZeroLayoutShift(await readReplyLayout(page), testInfo);
    releaseReply();
    await expect(page.getByText('Your draft is saved.')).toBeVisible();
    await page.evaluate(
      () =>
        new Promise<void>(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );
    expectZeroLayoutShift(await readReplyLayout(page), testInfo);
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
    await page.evaluate(() => {
      const toast = document.createElement('p');
      toast.id = 'toast';
      toast.setAttribute('role', 'alert');
      toast.style.cssText =
        'position:fixed;left:20px;top:20px;width:350px;height:54px;z-index:40;pointer-events:none';
      toast.textContent = 'Something went wrong';
      document.body.append(toast);
    });
    expect(await inspectEssentialViewport(page, ['#toast'])).toEqual({
      supported: true,
      findings: [],
    });
    await page.evaluate(() => {
      const cover = document.createElement('div');
      cover.id = 'cover';
      cover.style.cssText =
        'position:fixed;inset:0;z-index:50;background:white';
      document.body.append(cover);
    });
    expect((await inspectEssentialViewport(page, ['#toast'])).findings).toEqual(
      [expect.objectContaining({ reason: 'occluded' })]
    );
    await page.locator('#cover').evaluate(el => el.remove());
    await page.locator('#toast').evaluate(el => el.remove());
    await page.locator('#action').evaluate(el => el.after(el.cloneNode(true)));
    expect(
      (await inspectEssentialViewport(page, ['#action'])).findings
    ).toEqual([expect.objectContaining({ reason: 'duplicate' })]);
    expect(
      (await inspectEssentialViewport(page, ['#missing'])).findings
    ).toEqual([expect.objectContaining({ reason: 'missing' })]);
  });

  test('audits scaled composer controls in viewport coordinates and still rejects real clipping', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [scaleX, scaleY] of [
      [1.25, 1],
      [1, 1.25],
      [0.75, 0.75],
    ]) {
      await page.setContent(`
        <div style="position:fixed;left:20px;top:20px;transform:scale(${scaleX},${scaleY});transform-origin:top left">
          <div id="surface" style="position:relative;box-sizing:border-box;width:240px;height:120px;border:8px solid;overflow:hidden">
            <button id="action" style="position:absolute;left:164px;top:64px;width:60px;height:32px;border:0">Send</button>
          </div>
        </div>
      `);
      expect(await inspectEssentialViewport(page, ['#action'])).toEqual({
        supported: true,
        findings: [],
      });
      // Each axis must keep rejecting a real overflow, including scale < 1
      // where mixing client pixels and viewport pixels can hide the defect.
      for (const position of [
        { left: '215px', top: '64px' },
        { left: '164px', top: '100px' },
        { left: '-12px', top: '64px' },
        { left: '164px', top: '-12px' },
      ]) {
        await page.locator('#action').evaluate((el, next) => {
          Object.assign(el.style, next);
        }, position);
        expect(
          (await inspectEssentialViewport(page, ['#action'])).findings
        ).toEqual([
          expect.objectContaining({ selector: '#action', reason: 'clipped' }),
        ]);
      }
    }
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
