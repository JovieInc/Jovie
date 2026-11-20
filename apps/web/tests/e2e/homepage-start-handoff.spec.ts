import { HOMEPAGE_INVITE_ANCHOR } from '@/data/homepageEditorialCopy';
import { CLAIM_PROFILE_STARTER_PROMPT } from '@/data/marketingCtaIntents';
import { expect, test } from './setup';
import { installRuntimeAutomationBypass } from './utils/runtime-automation-bypass';
import { waitForHydration } from './utils/smoke-test-utils';

const HOMEPAGE_NAVIGATION_TIMEOUT = 60_000;
type PlaywrightPage = import('@playwright/test').Page;

test.use({ storageState: { cookies: [], origins: [] } });

async function interceptAnalytics(page: PlaywrightPage) {
  await page.route('**/api/profile/view', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
}

test.describe('Homepage -> /start automatic opener handoff', () => {
  for (const [label, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 390, height: 844 }],
  ] as const) {
    test(`auto-sends the /start opener on ${label} from both the hero CTA and handle form`, async ({
      browser,
      baseURL,
    }) => {
      const heroContext = await browser.newContext({ baseURL, viewport });
      try {
        const page = await heroContext.newPage();
        await page.addInitScript(installRuntimeAutomationBypass);
        await interceptAnalytics(page);
        let heroChatPosts = 0;
        await page.route('**/api/chat', async route => {
          if (route.request().method() === 'POST') heroChatPosts += 1;
          await route.fulfill({
            headers: {
              'content-type': 'text/event-stream',
              'x-vercel-ai-ui-message-stream': 'v1',
            },
            body: 'data: {"type":"start","messageId":"reply-1"}\n\ndata: {"type":"text-start","id":"t1"}\n\ndata: {"type":"text-delta","id":"t1","delta":"What should we call you on your page?"}\n\ndata: {"type":"text-end","id":"t1"}\n\ndata: {"type":"finish","finishReason":"stop"}\n\ndata: [DONE]\n\n',
          });
        });

        await page.goto('/', {
          waitUntil: 'domcontentloaded',
          timeout: HOMEPAGE_NAVIGATION_TIMEOUT,
        });
        await waitForHydration(page);
        await page.getByTestId('homepage-primary-cta').click();
        await expect(page).toHaveURL(/\/start\?starter_prompt=/);
        await expect(
          page
            .getByTestId('chat-user-bubble')
            .filter({ hasText: CLAIM_PROFILE_STARTER_PROMPT })
        ).toHaveCount(1);
        await expect.poll(() => heroChatPosts).toBe(1);
        await expect(
          page.getByText('What should we call you on your page?')
        ).toBeVisible();
      } finally {
        await heroContext.close();
      }

      const formContext = await browser.newContext({ baseURL, viewport });
      try {
        const page = await formContext.newPage();
        await page.addInitScript(installRuntimeAutomationBypass);
        await interceptAnalytics(page);
        let formChatPosts = 0;
        await page.route('**/api/chat', async route => {
          if (route.request().method() === 'POST') formChatPosts += 1;
          await route.fulfill({
            headers: {
              'content-type': 'text/event-stream',
              'x-vercel-ai-ui-message-stream': 'v1',
            },
            body: 'data: {"type":"start","messageId":"reply-2"}\n\ndata: {"type":"text-start","id":"t2"}\n\ndata: {"type":"text-delta","id":"t2","delta":"Checking jov.ie/lunaharbor — what should we call you?"}\n\ndata: {"type":"text-end","id":"t2"}\n\ndata: {"type":"finish","finishReason":"stop"}\n\ndata: [DONE]\n\n',
          });
        });

        await page.goto('/', {
          waitUntil: 'domcontentloaded',
          timeout: HOMEPAGE_NAVIGATION_TIMEOUT,
        });
        await waitForHydration(page);
        const close = page.locator(`#${HOMEPAGE_INVITE_ANCHOR}`);
        await close.scrollIntoViewIfNeeded();
        await close.locator('#homepage-claim-entry-handle').fill('lunaharbor');
        await close.getByTestId('homepage-close-cta').click();
        await expect(page).toHaveURL(
          /\/start\?starter_prompt=.*&handle=lunaharbor/
        );
        await expect(
          page
            .getByTestId('chat-user-bubble')
            .filter({ hasText: 'I want to claim jov.ie/lunaharbor.' })
        ).toHaveCount(1);
        await expect.poll(() => formChatPosts).toBe(1);
        await expect(
          page.getByText(
            'Checking jov.ie/lunaharbor — what should we call you?'
          )
        ).toBeVisible();
      } finally {
        await formContext.close();
      }
    });
  }
});
