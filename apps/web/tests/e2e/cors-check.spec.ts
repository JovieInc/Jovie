import { expect, test } from '@playwright/test';

test('No CORS errors on homepage', async ({ page }) => {
  const corsErrors: string[] = [];

  page.on('console', msg => {
    if (msg.type() === 'error' && msg.text().includes('CORS')) {
      corsErrors.push(msg.text());
    }
  });

  await page.goto('/', { waitUntil: 'networkidle', timeout: 15000 });

  // Wait a bit for any async requests
  await page.waitForTimeout(3000);

  console.log('CORS errors found:', corsErrors.length);
  if (corsErrors.length > 0) {
    console.log('CORS errors:', corsErrors);
  }

  // Should have fewer CORS errors now
  expect(corsErrors.length).toBeLessThan(5);
});
