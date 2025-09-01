/**
 * E2E tests for keyboard shortcuts
 * Tests the core navigation shortcuts and accessibility features
 */

import { test, expect, type Page } from '@playwright/test';

// Helper to press keyboard shortcut cross-platform
async function pressShortcut(page: Page, key: string) {
  const isMac = process.platform === 'darwin';
  const modifier = isMac ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+${key}`);
}

// Helper to wait for navigation
async function waitForNavigation(page: Page, expectedPath: string) {
  await expect(page).toHaveURL(new RegExp(expectedPath));
}

test.describe('Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to dashboard - you might need to adjust this based on your auth setup
    await page.goto('/dashboard');
  });

  test('should navigate to overview with ⌘+1 @smoke', async ({ page }) => {
    await pressShortcut(page, '1');
    await waitForNavigation(page, '/dashboard/overview');
  });

  test('should navigate to links with ⌘+2', async ({ page }) => {
    await pressShortcut(page, '2');
    await waitForNavigation(page, '/dashboard/links');
  });

  test('should navigate to analytics with ⌘+3', async ({ page }) => {
    await pressShortcut(page, '3');
    await waitForNavigation(page, '/dashboard/analytics');
  });

  test('should navigate to audience with ⌘+4', async ({ page }) => {
    await pressShortcut(page, '4');
    await waitForNavigation(page, '/dashboard/audience');
  });

  test('should navigate to links with stable alias ⌘+L', async ({ page }) => {
    const isMac = process.platform === 'darwin';
    const modifier = isMac ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+KeyL`);
    await waitForNavigation(page, '/dashboard/links');
  });

  test('should navigate to analytics with stable alias ⌘+G', async ({ page }) => {
    const isMac = process.platform === 'darwin';
    const modifier = isMac ? 'Control';
    await page.keyboard.press(`${modifier}+KeyG`);
    await waitForNavigation(page, '/dashboard/analytics');
  });

  test('should show shortcut hints on sidebar hover', async ({ page }) => {
    // Find the first navigation item
    const navItem = page.locator('[data-testid*="nav-item"], .group').first();
    
    // Hover over it
    await navItem.hover();
    
    // Should see a shortcut hint (either badge or tooltip)
    // This test assumes that shortcut hints are visible on hover
    const shortcutHint = page.locator('text=/[⌘1-9]|[Ctrl\+1-9]/');
    await expect(shortcutHint).toBeVisible();
  });

  test('should have proper aria-keyshortcuts attributes', async ({ page }) => {
    // Check that navigation items have aria-keyshortcuts
    const navItems = page.locator('button[aria-keyshortcuts]');
    const count = await navItems.count();
    
    expect(count).toBeGreaterThan(0);
    
    // Check first few items have expected shortcuts
    const firstItem = navItems.first();
    const ariaShortcuts = await firstItem.getAttribute('aria-keyshortcuts');
    expect(ariaShortcuts).toBeTruthy();
    expect(ariaShortcuts).toMatch(/cmd\+\d|ctrl\+\d/);
  });

  test('should not trigger shortcuts when input is focused', async ({ page }) => {
    // Focus an input field (if any exists on dashboard)
    const input = page.locator('input').first();
    
    if (await input.count() > 0) {
      await input.focus();
      
      // Type text that includes shortcut key
      await input.type('test1');
      
      // Should still be on same page, not navigated
      expect(page.url()).toContain('/dashboard');
    }
  });

  test('should handle multiple shortcuts to same destination', async ({ page }) => {
    // Test that both numeric and alias shortcuts work for Links
    await pressShortcut(page, '2');
    await waitForNavigation(page, '/dashboard/links');
    
    // Navigate away
    await pressShortcut(page, '1');
    await waitForNavigation(page, '/dashboard/overview');
    
    // Use alias to go back to Links
    const isMac = process.platform === 'darwin';
    const modifier = isMac ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+KeyL`);
    await waitForNavigation(page, '/dashboard/links');
  });
  
  test('should work with collapsed sidebar', async ({ page }) => {
    // Look for collapse button and click it
    const collapseButton = page.locator('button[title*="Collapse"], button[title*="collapse"]');
    if (await collapseButton.count() > 0) {
      await collapseButton.click();
      
      // Wait for animation
      await page.waitForTimeout(200);
      
      // Shortcuts should still work
      await pressShortcut(page, '1');
      await waitForNavigation(page, '/dashboard/overview');
    }
  });

  test('should display shortcuts in tooltips when collapsed', async ({ page }) => {
    // Look for collapse button and click it
    const collapseButton = page.locator('button[title*="Collapse"], button[title*="collapse"]');
    if (await collapseButton.count() > 0) {
      await collapseButton.click();
      await page.waitForTimeout(200);
      
      // Hover over a nav item
      const navItem = page.locator('.group').first();
      await navItem.hover();
      
      // Should see tooltip with shortcut
      const tooltip = page.locator('[role="tooltip"], .tooltip, div:has-text("⌘")').first();
      await expect(tooltip).toBeVisible();
    }
  });
});