/**
 * Test Setup for Vitest
 *
 * This file provides comprehensive test isolation to prevent state pollution
 * between tests. All global state modifications are tracked and cleaned up
 * automatically in afterEach hooks.
 *
 * Key isolation features:
 * - DOM cleanup via @testing-library/react cleanup()
 * - Global state cleanup (globalThis properties added during tests)
 * - Environment variable restoration
 * - Mock cleanup (vi.clearAllMocks())
 * - Storage cleanup (localStorage, sessionStorage)
 *
 * Usage:
 * - This file is auto-loaded by vitest.config.mts for all tests
 * - Integration tests should also import './setup-db' explicitly
 * - Component tests should also import './setup-mocks' explicitly
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, vi } from 'vitest';

// Extend expect with jest-dom matchers (lightweight, always needed)
expect.extend(matchers);

// ============================================================================
// State Isolation Tracking
// ============================================================================

/**
 * Track original environment variables before each test.
 * We only track keys that exist at test start, so we can detect
 * and clean up any new env vars added during the test.
 */
let originalEnvKeys: Set<string> = new Set();

/**
 * Known test state properties that tests commonly set on globalThis.
 * These are tracked and cleaned up after each test.
 */
const TEST_STATE_PROPERTIES = [
  // Web vitals initialization state
  'jovieWebVitalsInitialized',
  'jovieWebVitalsHandlers',
  // Database references
  'db',
  // Test-specific flags
  'testCleanupRegistered',
] as const;

// ============================================================================
// Setup Hooks
// ============================================================================

/**
 * Before each test, capture the initial environment state.
 * This allows us to detect and clean up any mutations.
 */
beforeEach(() => {
  // Snapshot current environment variable keys
  originalEnvKeys = new Set(Object.keys(process.env));
});

/**
 * After each test, perform comprehensive cleanup to prevent state pollution.
 *
 * Note: Timer cleanup (vi.useRealTimers()) is intentionally NOT included here
 * because many tests use fake timers in beforeEach/beforeAll and expect them
 * to persist across test cases within a file. Tests that use fake timers
 * should manage their own timer lifecycle.
 */
afterEach(() => {
  // 1. Clean up React Testing Library DOM
  cleanup();

  // 2. Clear all Vitest mocks (spies, stubs, mock implementations)
  // Note: This clears mock call history but preserves mock implementations.
  // Use vi.restoreAllMocks() in individual tests if you need to restore
  // original implementations.
  vi.clearAllMocks();

  // 3. Clean up known test state properties on globalThis
  for (const prop of TEST_STATE_PROPERTIES) {
    if (prop in globalThis) {
      delete (globalThis as Record<string, unknown>)[prop];
    }
  }

  // 4. Clean up any environment variables added during the test
  const currentEnvKeys = Object.keys(process.env);
  for (const key of currentEnvKeys) {
    if (!originalEnvKeys.has(key)) {
      delete process.env[key];
    }
  }

  // 5. Clean up any localStorage/sessionStorage (if available in jsdom)
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.clear();
    } catch {
      // Ignore errors in non-browser environments
    }
  }
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.clear();
    } catch {
      // Ignore errors in non-browser environments
    }
  }
});

// ============================================================================
// Console Suppression
// ============================================================================

/**
 * Suppress noisy runtime warnings that depend on optional integrations.
 * Tests can still explicitly check console output by mocking console methods.
 */
global.console = {
  ...console,
  debug: () => {},
  warn: () => {},
};

// ============================================================================
// Utility Exports
// ============================================================================

/**
 * Helper to detect potential state pollution issues.
 * Call this in afterEach if you suspect cross-test interference.
 *
 * @example
 * afterEach(() => {
 *   const issues = detectStatePollution();
 *   if (issues.length > 0) {
 *     console.warn('State pollution detected:', issues);
 *   }
 * });
 */
export function detectStatePollution(): string[] {
  const issues: string[] = [];

  // Check for unreset test state
  for (const prop of TEST_STATE_PROPERTIES) {
    if (prop in globalThis) {
      issues.push(`Test state not cleaned up: ${prop}`);
    }
  }

  return issues;
}

/**
 * Create a test-scoped environment variable that automatically
 * cleans itself up after the test completes.
 *
 * @example
 * it('should use encryption key', () => {
 *   const restoreEnv = withTestEnv({ PII_ENCRYPTION_KEY: 'test-key' });
 *   // ... test code ...
 *   restoreEnv(); // Manually restore if needed before test ends
 * });
 */
export function withTestEnv(envVars: Record<string, string>): () => void {
  const originalValues: Record<string, string | undefined> = {};

  // Save original values and set test values
  for (const [key, value] of Object.entries(envVars)) {
    originalValues[key] = process.env[key];
    process.env[key] = value;
  }

  // Return cleanup function
  return () => {
    for (const [key, originalValue] of Object.entries(originalValues)) {
      if (originalValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValue;
      }
    }
  };
}

// ============================================================================
// Module Exports
// ============================================================================

// Load browser globals (always needed for jsdom)
export { setupBrowserGlobals } from './setup-browser';
// Load database setup ONLY for integration tests
// Integration tests should import './setup-db' explicitly
// Unit tests skip this entirely
export { setupDatabase } from './setup-db';
// Load component mocks ONLY for component tests
// Tests that need these should import './setup-mocks' explicitly
export { setupComponentMocks } from './setup-mocks';

// Auto-load browser globals for all tests (lightweight)
import './setup-browser';
