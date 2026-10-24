import { writeFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import {
  buildInteractionLatencyReport,
  type InteractionLatencySample,
} from '@/scripts/performance-interaction-report';
import {
  installDecisionLatencyProbe,
  measureInboxScroll,
} from '../e2e/utils/interaction-latency-utils';
import {
  DECISION_FIXTURE_SIZE,
  opportunityDecisionFixture,
  ovieDecisionFixture,
} from '../helpers/decision-inbox-fixtures';

type Probe = {
  firstFeedbackMs: number;
  dataReadyMs: number;
  responseHeadersMs: number;
  usableStateMs: number;
  renderToInteractiveMs: number;
  stop: () => void;
};
type ProbeWindow = Window & { __decisionProbe: Probe };
test.use({ video: 'off', trace: 'off' });

const cases = [
  { action: 'approve', status: 200 },
  { action: 'reject', status: 200 },
  { action: 'revise', status: 200 },
  { action: 'revise', status: 503 },
  { action: 'reject', status: 409 },
] as const;

async function installSyntheticTransport(page: Page) {
  // Use Storybook's supported per-story transport hook. The component and
  // mutation code execute normally; only HTTP is synthetic and model-free.
  await page.addInitScript(() => {
    (window as Window & { __jovieApiMock?: unknown }).__jovieApiMock = ({
      url,
      init,
    }: {
      url: URL;
      init?: RequestInit;
    }) => {
      if (
        url.pathname.startsWith('/api/connectors/suggested-actions') ||
        url.pathname.startsWith('/api/ovie/')
      ) {
        return fetch(`/decision-fixture${url.pathname}`, init);
      }
      return undefined;
    };
  });
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  for (const surface of ['opportunity', 'ovie'] as const) {
    test(`${surface} decisions meet budgets at ${viewport.width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await installSyntheticTransport(page);
      const samples: InteractionLatencySample[] = [];
      const story =
        surface === 'opportunity'
          ? 'dashboard-opportunity-inbox-page-client--decision-performance'
          : 'features-admin-hud-ovieinbox--decision-performance';
      let currentCases = [...ovieDecisionFixture.cases];
      let currentCards = [...opportunityDecisionFixture.cards];

      // One unscored warmup, then five measured outcome samples per layout.
      for (let runIndex = -1; runIndex < cases.length; runIndex++) {
        const scenario = cases[Math.max(0, runIndex)]!;
        const action =
          surface === 'ovie' && scenario.action === 'revise'
            ? 'reject'
            : scenario.action;
        const decisionId =
          surface === 'ovie'
            ? currentCases[0]!.decisionTarget!.id
            : currentCards[0]!.id;
        const card =
          surface === 'opportunity'
            ? `[data-testid="opportunity-inbox-card-${decisionId}"]`
            : '[data-testid="ovie-inbox-decision"]';
        const nextCard =
          surface === 'opportunity'
            ? `[data-testid="opportunity-inbox-card-${currentCards[1]!.id}"]`
            : `[data-testid="ovie-inbox-decision"][data-case-id="${currentCases[1]!.id}"]`;
        const nextTitle = currentCases[1]!.title;
        let postCount = 0;
        let reads = 0;
        let submitted: unknown;
        let release!: () => void;
        const gate = new Promise<void>(resolve => {
          release = resolve;
        });
        await page.route('**/decision-fixture/api/**', async route => {
          if (route.request().method() !== 'POST') {
            reads++;
            await route.fulfill({
              json:
                surface === 'ovie'
                  ? { cases: currentCases, issues: [] }
                  : { ...opportunityDecisionFixture, cards: currentCards },
            });
            return;
          }
          postCount++;
          submitted = route.request().postDataJSON();
          await Promise.all([
            gate,
            new Promise(resolve => setTimeout(resolve, 600)),
          ]);
          if (scenario.status === 200) {
            currentCases = currentCases.slice(1);
            currentCards = currentCards.slice(1);
          }
          if (scenario.status === 409)
            currentCards[0] = {
              ...currentCards[0]!,
              why: 'Latest authoritative evidence.',
            };
          if (scenario.status === 409)
            currentCases[0] = {
              ...currentCases[0]!,
              body: 'Latest authoritative evidence.\n'.repeat(48),
            };
          await route.fulfill({
            status: scenario.status,
            json:
              scenario.status === 200
                ? { ok: true }
                : { error: 'Synthetic decision failure' },
          });
        });
        if (runIndex === -1)
          await page.goto(`/iframe.html?id=${story}&viewMode=story`);
        expect(
          await page.locator('script[src*="/@vite/client"]').count(),
          'Performance qualification requires a production Storybook build'
        ).toBe(0);
        const article = page.locator(card);
        await expect(article).toBeVisible({ timeout: 60_000 });
        await page.waitForLoadState('networkidle');
        await page.evaluate(() => document.fonts.ready);
        const notes =
          surface === 'opportunity'
            ? page.getByLabel('Notes', { exact: true })
            : page.getByLabel('Decision notes');
        await notes.fill('Keep these entered notes');
        if (surface === 'opportunity' && scenario.action === 'revise') {
          await article
            .getByRole('button', { name: 'Revise', exact: true })
            .click();
          await article
            .getByLabel('Revision feedback for Jovie')
            .fill('Preserve this revision comment');
        }
        const name =
          surface === 'ovie'
            ? action === 'approve'
              ? 'Approve'
              : 'Reject'
            : action === 'approve'
              ? 'Approve reply'
              : action === 'reject'
                ? 'Dismiss'
                : 'Request revision';
        let trigger = article.getByRole('button', { name, exact: true });
        await trigger.scrollIntoViewIfNeeded();
        await trigger.focus();
        const idleBox = await trigger.boundingBox();
        // Stable selector for the native control, without relying on changing labels.
        await page
          .locator('[data-decision-trigger]')
          .evaluateAll(elements =>
            elements.forEach(element =>
              element.removeAttribute('data-decision-trigger')
            )
          );
        await trigger.evaluate(element =>
          element.setAttribute('data-decision-trigger', 'true')
        );
        const triggerSelector = '[data-decision-trigger="true"]';
        trigger = page.locator(triggerSelector);
        const responsePath =
          surface === 'ovie'
            ? `/api/ovie/summer-cards/${decisionId}/decision`
            : `/api/connectors/suggested-actions/${decisionId}/${action}`;
        const succeeded = scenario.status === 200;
        const usable = succeeded
          ? surface === 'opportunity'
            ? `body:not(:has(${card})) ${nextCard} button:not(:disabled)`
            : `${nextCard} button:not(:disabled)`
          : `${surface === 'opportunity' && scenario.status === 409 ? '[data-fixture-reconciled="true"] ' : ''}${triggerSelector}:not(:disabled)`;
        const priorSuccesses = await page
          .locator('[data-sonner-toast][data-type="success"]')
          .evaluateAll(elements =>
            elements.map(element => element.getAttribute('data-index'))
          );
        await page.evaluate(installDecisionLatencyProbe, {
          trigger: triggerSelector,
          pending: `${triggerSelector}:disabled`,
          usable,
          responsePath,
        });
        // Same-task duplicate activation exercises the synchronous lock before
        // TanStack Query has notified React of its pending state.
        await trigger.evaluate(element => {
          (element as HTMLButtonElement).click();
          (element as HTMLButtonElement).click();
        });
        await page.waitForFunction(
          () =>
            (window as ProbeWindow).__decisionProbe.firstFeedbackMs !==
            undefined,
          undefined,
          { timeout: 10_000 }
        );
        expect(postCount).toBe(1);
        await expect(article).toBeVisible();
        await expect(notes).toHaveValue('Keep these entered notes');
        const pendingSuccesses = await page
          .locator('[data-sonner-toast][data-type="success"]')
          .evaluateAll(elements =>
            elements.map(element => element.getAttribute('data-index'))
          );
        expect(pendingSuccesses.every(id => priorSuccesses.includes(id))).toBe(
          true
        );
        await expect(trigger).toBeDisabled();
        const pendingBox = await trigger.boundingBox();
        expect(pendingBox!.width).toBeCloseTo(idleBox!.width, 0);
        expect(pendingBox!.height).toBeCloseTo(idleBox!.height, 0);
        release();
        // Capture the browser milestone before outcome assertions run selector
        // engines that can force stylesheet work across the populated feed.
        await page.waitForFunction(
          () =>
            (window as ProbeWindow).__decisionProbe.renderToInteractiveMs !==
            undefined,
          undefined,
          { timeout: 10_000 }
        );
        if (succeeded) {
          if (surface === 'opportunity') await expect(article).toHaveCount(0);
          else await expect(article).toContainText(nextTitle);
        } else {
          await expect(trigger).toBeEnabled();
          await expect(notes).toHaveValue('Keep these entered notes');
          if (surface === 'opportunity' && scenario.action === 'revise')
            await expect(
              article.getByLabel('Revision feedback for Jovie')
            ).toHaveValue('Preserve this revision comment');
          if (surface === 'opportunity' && scenario.status === 409) {
            expect(reads).toBeGreaterThanOrEqual(1);
            await expect(article).toContainText(
              'Latest authoritative evidence.'
            );
          }
          if (surface === 'ovie' && scenario.status === 409) {
            expect(reads).toBeGreaterThanOrEqual(1);
            await expect(article).toContainText(
              'Latest authoritative evidence.'
            );
          }
          await expect(trigger).toBeFocused();
        }
        if (surface === 'opportunity')
          await expect(notes).toHaveValue('Keep these entered notes');
        if (surface === 'ovie')
          expect(submitted).toMatchObject({
            decision: action,
            comment: 'Keep these entered notes',
          });
        if (surface === 'opportunity' && scenario.action === 'revise')
          expect(submitted).toMatchObject({
            comment: 'Preserve this revision comment',
          });
        await page.waitForFunction(
          () =>
            (window as ProbeWindow).__decisionProbe.renderToInteractiveMs !==
            undefined,
          undefined,
          { timeout: 10_000 }
        );
        const timing = await page.evaluate(() => {
          const {
            firstFeedbackMs,
            dataReadyMs,
            responseHeadersMs,
            usableStateMs,
            renderToInteractiveMs,
          } = (window as ProbeWindow).__decisionProbe;
          (window as ProbeWindow).__decisionProbe.stop();
          return {
            firstFeedbackMs,
            dataReadyMs,
            responseHeadersMs,
            usableStateMs,
            renderToInteractiveMs,
          };
        });
        expect(timing.dataReadyMs).toBeGreaterThanOrEqual(600);
        expect(timing.firstFeedbackMs).toBeLessThan(timing.dataReadyMs);
        if (runIndex >= 0)
          samples.push({
            ...timing,
            runIndex,
            scenarioId: `${surface}-inbox-decision`,
          });
        await page.waitForLoadState('networkidle');
        await page.unroute('**/decision-fixture/api/**');
      }
      const scroll = await measureInboxScroll(
        page,
        surface === 'opportunity'
          ? '[data-testid="opportunity-inbox-feed"]'
          : '[data-testid="ovie-inbox"]'
      );
      expect(scroll.frames).toBe(60);
      expect(scroll.distance).toBeGreaterThan(100);
      const report = buildInteractionLatencyReport({
        samples: samples.map(sample => ({
          ...sample,
          droppedFrameCount: scroll.droppedFrameCount,
        })),
        metadata: {
          browser: 'chromium',
          buildMode: 'production',
          viewport: `${viewport.width}x${viewport.height}`,
          datasetSize: `${surface === 'opportunity' ? DECISION_FIXTURE_SIZE : 80} synthetic decisions; Ovie mounts one current case`,
          cpuProfile: 'unthrottled',
          networkProfile: '600ms delayed POST; local synthetic reconciliation',
          sampleCount: samples.length,
        },
      });
      const reportPath = testInfo.outputPath('decision-inbox-performance.json');
      await writeFile(reportPath, JSON.stringify({ report, scroll }, null, 2));
      await testInfo.attach('decision-inbox-performance.json', {
        path: reportPath,
        contentType: 'application/json',
      });
      await testInfo.attach('decision-inbox-layout.png', {
        body: await page.screenshot({
          path: testInfo.outputPath('decision-inbox-layout.png'),
        }),
        contentType: 'image/png',
      });
      expect(report.status, JSON.stringify(report.summaries, null, 2)).toBe(
        'pass'
      );
    });
  }
}
