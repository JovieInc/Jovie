import { expect, test } from '@playwright/test';
import { FOUNDER_DEMO_DURATION_SECONDS } from '@/lib/demo-founder-video';

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1280, height: 720 },
});

test('founder-led 90-second recording surface', async ({ page }) => {
  test.setTimeout(140_000);

  await page.goto('/demo/founder-video', {
    waitUntil: 'networkidle',
    timeout: 60_000,
  });

  await expect(page.getByTestId('founder-demo-recording-surface')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('Jovie found an opportunity')).toBeVisible();

  const recordingSeconds = Number(
    process.env.FOUNDER_DEMO_RECORDING_SECONDS ?? FOUNDER_DEMO_DURATION_SECONDS
  );

  await page.waitForTimeout(Math.ceil((recordingSeconds + 0.75) * 1000));

  const video = page.video();
  if (video) {
    await page.close();
    await video.saveAs('test-results/founder-demo.webm');
    console.log('[founder-demo] Video saved to test-results/founder-demo.webm');
  }
});
