import { expect, test } from '@playwright/test';
import { measureInteractionLatency } from '../utils/interaction-latency-utils';

test.describe('interaction latency measurement helper', () => {
  test('measures event to first feedback and usable state in the browser', async ({
    page,
  }) => {
    await page.setContent(`
      <button id="trigger" type="button">Trigger</button>
      <div id="feedback" hidden>Feedback</div>
      <script>
        document.querySelector('#trigger').addEventListener('click', () => {
          setTimeout(() => {
            document.querySelector('#feedback').hidden = false;
            document.querySelector('#feedback').setAttribute('data-usable', 'true');
          }, 50);
        });
      </script>
    `);

    const sample = await measureInteractionLatency(page, {
      action: () => page.locator('#trigger').click(),
      firstFeedback: () => expect(page.locator('#feedback')).toBeVisible(),
      scenarioId: 'synthetic-first-feedback',
      usableState: () =>
        expect(page.locator('#feedback')).toHaveAttribute(
          'data-usable',
          'true'
        ),
    });

    expect(sample.firstFeedbackMs).toBeGreaterThanOrEqual(45);
    expect(sample.firstFeedbackMs).toBeLessThan(500);
    expect(sample.nextPaintMs).toBeGreaterThanOrEqual(0);
    expect(sample.nextPaintMs).toBeLessThanOrEqual(sample.firstFeedbackMs);
    expect(sample.usableStateMs).toBeGreaterThanOrEqual(sample.firstFeedbackMs);
  });
});
