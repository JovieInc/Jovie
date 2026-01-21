/**
 * Clipboard Mock Utilities
 *
 * Provides reusable helpers for mocking clipboard operations in tests.
 * Handles both the modern Clipboard API and legacy execCommand fallback.
 *
 * @example
 * ```ts
 * import { setupClipboardMocks, createTextareaMock, restoreDomMethods } from '@/tests/test-utils/browser/clipboard-mocks';
 *
 * describe('CopyButton', () => {
 *   afterEach(() => {
 *     restoreDomMethods();
 *   });
 *
 *   it('copies text', async () => {
 *     const { mockWriteText } = setupClipboardMocks({ available: true, success: true });
 *     // ... test
 *     expect(mockWriteText).toHaveBeenCalledWith('expected text');
 *   });
 * });
 * ```
 */
import { vi } from 'vitest';

// Store original DOM methods for restoration
const originalCreateElement = document.createElement.bind(document);
const originalAppendChild = document.body.appendChild.bind(document.body);
const originalRemoveChild = document.body.removeChild.bind(document.body);

export interface ClipboardMockOptions {
  /** Whether the clipboard API is available */
  available?: boolean;
  /** Whether clipboard.writeText succeeds */
  success?: boolean;
  /** Whether execCommand('copy') succeeds (fallback) */
  execCommandSuccess?: boolean;
}

export interface ClipboardMockResult {
  /** Mock for navigator.clipboard.writeText */
  mockWriteText: ReturnType<typeof vi.fn>;
  /** Mock for document.execCommand */
  mockExecCommand: ReturnType<typeof vi.fn>;
  /** The mock clipboard object */
  mockClipboard: { writeText: ReturnType<typeof vi.fn> };
}

/**
 * Sets up clipboard mocks for testing copy functionality.
 * Handles both modern Clipboard API and legacy execCommand fallback.
 *
 * @param options - Configuration for mock behavior
 * @returns Object containing mock functions for assertions
 */
export function setupClipboardMocks(
  options: ClipboardMockOptions = {}
): ClipboardMockResult {
  const {
    available = true,
    success = true,
    execCommandSuccess = true,
  } = options;

  const mockWriteText = vi.fn();
  const mockExecCommand = vi.fn().mockReturnValue(execCommandSuccess);

  const mockClipboard = { writeText: mockWriteText };

  // Set up clipboard API mock
  if (available) {
    Object.defineProperty(navigator, 'clipboard', {
      value: mockClipboard,
      writable: true,
      configurable: true,
    });

    if (success) {
      mockWriteText.mockResolvedValue(undefined);
    } else {
      mockWriteText.mockRejectedValue(new Error('Clipboard write failed'));
    }
  } else {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  }

  // Set up execCommand mock (legacy fallback)
  Object.defineProperty(document, 'execCommand', {
    value: mockExecCommand,
    writable: true,
    configurable: true,
  });

  return { mockWriteText, mockExecCommand, mockClipboard };
}

export interface TextareaMock {
  focus: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  value: string;
  style: Record<string, string>;
}

/**
 * Creates a mock textarea element for testing clipboard fallback.
 * Use with setupTextareaDomMocks() to intercept document.createElement('textarea').
 */
export function createTextareaMock(): TextareaMock {
  return {
    focus: vi.fn(),
    select: vi.fn(),
    remove: vi.fn(),
    value: '',
    style: {},
  };
}

export interface TextareaDomMocksResult {
  mockTextarea: TextareaMock;
  mockCreateElement: ReturnType<typeof vi.fn>;
  mockAppendChild: ReturnType<typeof vi.fn>;
  mockRemoveChild: ReturnType<typeof vi.fn>;
}

/**
 * Sets up DOM method mocks to intercept textarea creation for clipboard fallback testing.
 * Call restoreDomMethods() in afterEach to clean up.
 *
 * @param mockTextarea - Optional pre-created textarea mock
 * @returns Object containing all mock functions
 */
export function setupTextareaDomMocks(
  mockTextarea?: TextareaMock
): TextareaDomMocksResult {
  const textarea = mockTextarea ?? createTextareaMock();

  const mockAppendChild = vi.fn((node: Node | TextareaMock) => {
    if (node === textarea) {
      return node;
    }
    return originalAppendChild(node as Node);
  });

  const mockRemoveChild = vi.fn((node: Node | TextareaMock) => {
    if (node === textarea) {
      return node;
    }
    return originalRemoveChild(node as Node);
  });

  const mockCreateElement = vi.fn((tagName: string) => {
    if (tagName === 'textarea') {
      return textarea as unknown as HTMLTextAreaElement;
    }
    return originalCreateElement(tagName);
  });

  Object.defineProperty(document, 'createElement', {
    value: mockCreateElement,
    writable: true,
    configurable: true,
  });

  Object.defineProperty(document.body, 'appendChild', {
    value: mockAppendChild,
    writable: true,
    configurable: true,
  });

  Object.defineProperty(document.body, 'removeChild', {
    value: mockRemoveChild,
    writable: true,
    configurable: true,
  });

  return {
    mockTextarea: textarea,
    mockCreateElement,
    mockAppendChild,
    mockRemoveChild,
  };
}

/**
 * Restores original DOM methods after testing.
 * Call this in afterEach() to clean up mocks.
 */
export function restoreDomMethods(): void {
  Object.defineProperty(document, 'createElement', {
    value: originalCreateElement,
    writable: true,
    configurable: true,
  });

  Object.defineProperty(document.body, 'appendChild', {
    value: originalAppendChild,
    writable: true,
    configurable: true,
  });

  Object.defineProperty(document.body, 'removeChild', {
    value: originalRemoveChild,
    writable: true,
    configurable: true,
  });
}

/**
 * Returns the original document.createElement function.
 * Use this when you need to call the real createElement inside a custom mock.
 */
export function getOriginalCreateElement() {
  return originalCreateElement;
}

/**
 * Combined setup for full clipboard fallback testing.
 * Sets up both clipboard API mocks and textarea DOM mocks.
 *
 * @param options - Configuration for mock behavior
 * @returns Combined mock objects
 */
export function setupFullClipboardMocks(options: ClipboardMockOptions = {}) {
  const clipboardMocks = setupClipboardMocks(options);
  const textareaMocks = setupTextareaDomMocks();

  return {
    ...clipboardMocks,
    ...textareaMocks,
  };
}
