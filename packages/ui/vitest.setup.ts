/**
 * UI Package Test Setup
 *
 * Minimal setup file for @jovie/ui component tests.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';

// Extend expect with jest-dom matchers
expect.extend(matchers);

// Ensure the DOM is cleaned up between tests
afterEach(() => {
  cleanup();
});

// Mock ResizeObserver (not available in jsdom)
globalThis.ResizeObserver = class ResizeObserver {
  observe() {
    // No-op: jsdom does not implement ResizeObserver
  }
  unobserve() {
    // No-op: jsdom does not implement ResizeObserver
  }
  disconnect() {
    // No-op: jsdom does not implement ResizeObserver
  }
};

// Mock pointer capture methods (not available in jsdom, required by Radix UI)
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = function () {
    return false;
  };
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function () {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = function () {};
}

// Mock scrollIntoView (not available in jsdom, required by Radix Select)
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}
