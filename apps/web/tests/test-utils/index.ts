/**
 * Test Utilities
 *
 * Centralized exports for all test utilities.
 * Import from this file for convenient access to all helpers.
 *
 * @example
 * ```ts
 * import {
 *   createDrizzleMocksHoisted,
 *   createTransactionMock,
 *   setupClipboardMocks,
 *   restoreDomMethods,
 * } from '@/tests/test-utils';
 * ```
 */

// Atom testing utilities
export {
  expectFastRender,
  expectKeyboardNavigable,
  expectProperAriaAttributes,
  expectReducedMotionSupport,
  expectScreenReaderAnnouncement,
  measureRenderTime,
  mockIconProps,
  mockImageProps,
  mockProgressSteps,
  mockUser,
  renderInForm,
  renderWithTheme,
  simulateKeyboard,
  waitForFocus,
} from './atoms';
// Browser/DOM mocks
export {
  type ClipboardMockOptions,
  type ClipboardMockResult,
  createTextareaMock,
  getOriginalCreateElement,
  restoreDomMethods,
  setupClipboardMocks,
  setupFullClipboardMocks,
  setupTextareaDomMocks,
  type TextareaDomMocksResult,
  type TextareaMock,
} from './browser/clipboard-mocks';
// Database mocks
export {
  createDbMock,
  createDeleteChain,
  createDrizzleMocksHoisted,
  createInsertChain,
  createSelectChain,
  createTransactionMock,
  createUpdateChain,
  type DrizzleMocks,
  type MockFn,
  type TransactionContext,
  type TransactionMockOptions,
} from './db/drizzle-query-mock';
