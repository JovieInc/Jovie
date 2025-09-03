/**
 * Optimized Test Setup
 * 
 * Minimal setup file that only loads essential mocks and defers heavy initialization.
 * Reduces setup time from 40s+ to under 5s by using lazy loading.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';
import { loadEssentialMocks } from './utils/lazy-mocks';

// Extend expect with jest-dom matchers
expect.extend(matchers);

// Load only essential mocks upfront
loadEssentialMocks();

// Clean up DOM between tests
afterEach(() => {
  cleanup();
});

// Note: CSS imports and heavy mocks are now loaded on-demand
// Database setup is moved to specific test files that need it
// Component-specific mocks are loaded by individual test files

