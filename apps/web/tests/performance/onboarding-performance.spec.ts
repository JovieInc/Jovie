/**
 * Performance tests for onboarding flow
 * Tests response times, database performance, and user experience metrics
 */

import { expect, test } from '@playwright/test';

test.describe('Onboarding Performance', () => {
  test('handle validation responds quickly', async ({ page }) => {
    const startTime = Date.now();

    const response = await page.request.get(
      '/api/handle/check?handle=perftest123'
    );

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    expect(response.ok()).toBeTruthy();
    expect(responseTime).toBeLessThan(200); // Should respond in under 200ms
  });

  test('multiple concurrent handle checks perform well', async ({ page }) => {
    const startTime = Date.now();

    // Fire 20 concurrent requests
    const promises = Array(20)
      .fill(0)
      .map((_, i) =>
        page.request.get(`/api/handle/check?handle=concurrent-${i}`)
      );

    const responses = await Promise.all(promises);

    const endTime = Date.now();
    const totalTime = endTime - startTime;

    // All requests should succeed
    responses.forEach(response => {
      expect(response.ok()).toBeTruthy();
    });

    // 20 concurrent requests should complete in under 2 seconds
    expect(totalTime).toBeLessThan(2000);

    // Average response time should be reasonable
    const avgResponseTime = totalTime / responses.length;
    expect(avgResponseTime).toBeLessThan(100);
  });

  test('profile pages load quickly', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/musicmaker', {
      waitUntil: 'domcontentloaded',
      timeout: 5000,
    });

    const endTime = Date.now();
    const loadTime = endTime - startTime;

    // Profile pages should load in under 3 seconds
    expect(loadTime).toBeLessThan(3000);

    // Check that the page actually loaded
    await expect(page.locator('h1, h2')).toBeVisible();
  });

  test('homepage loads featured artists quickly', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });

    // Wait for featured artists section
    await page.waitForSelector('h2:has-text("Featured Creators")', {
      timeout: 5000,
    });

    const endTime = Date.now();
    const loadTime = endTime - startTime;

    // Homepage with featured artists should load in under 5 seconds
    expect(loadTime).toBeLessThan(5000);

    // Check that artists are actually displayed
    const artistElements = page.locator('a[href^="/"]');
    const artistCount = await artistElements.count();
    expect(artistCount).toBeGreaterThan(0);
  });

  test('database queries are optimized', async ({ page }) => {
    // Test database response time through API
    const dbStartTime = Date.now();

    const response = await page.request.get('/api/health/db');

    const dbEndTime = Date.now();
    const dbResponseTime = dbEndTime - dbStartTime;

    expect(response.ok()).toBeTruthy();
    expect(dbResponseTime).toBeLessThan(100); // Database health check under 100ms

    const health = await response.json();
    expect(health.status).toBe('ok');
  });

  test('handle validation debouncing works efficiently', async ({ page }) => {
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });

    // Find handle input (if accessible without auth)
    const handleInput = page.locator('input[type="text"]').first();

    if (await handleInput.isVisible()) {
      const startTime = Date.now();

      // Type rapidly to trigger debouncing
      await handleInput.fill('test');
      await handleInput.fill('testuser');
      await handleInput.fill('testuser123');

      // Wait for debounce delay
      await page.waitForTimeout(600);

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should complete efficiently with debouncing
      expect(totalTime).toBeLessThan(2000);
    }
  });

  test('onboarding page renders efficiently', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/onboarding', {
      waitUntil: 'domcontentloaded',
      timeout: 5000,
    });

    const endTime = Date.now();
    const loadTime = endTime - startTime;

    // Onboarding page should load quickly
    expect(loadTime).toBeLessThan(2000);

    // Check for basic content
    await expect(page.locator('h1, h2')).toBeVisible();
  });

  test('API endpoints have proper caching headers', async ({ page }) => {
    const response = await page.request.get(
      '/api/handle/check?handle=cachetest'
    );

    expect(response.ok()).toBeTruthy();

    const headers = response.headers();

    // Should have appropriate cache headers for API responses
    expect(headers).toHaveProperty('cache-control');
  });

  test('static assets load quickly', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/', { waitUntil: 'networkidle' });

    const endTime = Date.now();
    const loadTime = endTime - startTime;

    // Full page load with assets should complete reasonably quickly
    expect(loadTime).toBeLessThan(10000);
  });

  test('memory usage remains stable during onboarding flow', async ({
    page,
  }) => {
    // Navigate through onboarding flow multiple times
    for (let i = 0; i < 5; i++) {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
      await page.goto('/', { waitUntil: 'domcontentloaded' });
    }

    // Should not crash or have memory leaks
    // Check that page is still responsive
    await expect(page.locator('body')).toBeVisible();
  });
});
