/**
 * Optimized Test Setup
 *
 * Minimal setup file that only loads essential mocks and defers heavy initialization.
 * Reduces setup time from 40s+ to under 5s by using lazy loading.
 *
 * Updated to trigger CI workflow after fixing lint command issue.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect, vi } from 'vitest';
import {
  loadBrowserApiMocks,
  loadNextJsMocks,
  loadServerOnlyMocks,
} from './utils/lazy-mocks';

// Extend expect with jest-dom matchers
expect.extend(matchers);

loadBrowserApiMocks();
loadNextJsMocks();
loadServerOnlyMocks();

// Mock console methods to reduce noise
global.console = {
  ...console,
  warn: vi.fn(),
  error: vi.fn(),
};

// Clean up DOM between tests
afterEach(() => {
  cleanup();
});

// Note: CSS imports and heavy mocks are now loaded on-demand
// Database setup is moved to specific test files that need it
// Component-specific mocks are loaded by individual test files
