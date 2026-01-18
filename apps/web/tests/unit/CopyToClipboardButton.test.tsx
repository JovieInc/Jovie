import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Use fake timers for faster tests
vi.useFakeTimers();

// Helper to flush promises and timers
const flushPromises = async () => {
  await act(async () => {
    await Promise.resolve();
    vi.advanceTimersByTime(0);
  });
};

import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';

// Mock the analytics module
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

// Mock platform detection
vi.mock('@/lib/utils/platform-detection', () => ({
  getBaseUrl: vi.fn(() => 'https://jov.ie'),
}));

// Mock clipboard API
const mockClipboard = {
  writeText: vi.fn(),
};

const mockExecCommand = vi.fn();

// Preserve original DOM methods so we can delegate for non-textarea elements
const originalCreateElement = document.createElement.bind(document);
const originalAppendChild = document.body.appendChild.bind(document.body);
const originalRemoveChild = document.body.removeChild.bind(document.body);

// Helper to setup clipboard mocks
const setupClipboardMocks = (
  clipboardAvailable: boolean,
  clipboardSuccess: boolean = true,
  execCommandSuccess: boolean = true
) => {
  if (clipboardAvailable) {
    Object.defineProperty(navigator, 'clipboard', {
      value: mockClipboard,
      writable: true,
    });

    if (clipboardSuccess) {
      mockClipboard.writeText.mockResolvedValue(undefined);
    } else {
      mockClipboard.writeText.mockRejectedValue(new Error('Clipboard failed'));
    }
  } else {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      writable: true,
    });
  }

  Object.defineProperty(document, 'execCommand', {
    value: mockExecCommand,
    writable: true,
  });

  mockExecCommand.mockReturnValue(execCommandSuccess);
};

import { track } from '@/lib/analytics';

describe('CopyToClipboardButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(document, 'createElement', {
      value: originalCreateElement,
      writable: true,
    });

    Object.defineProperty(document.body, 'appendChild', {
      value: originalAppendChild,
      writable: true,
    });

    Object.defineProperty(document.body, 'removeChild', {
      value: originalRemoveChild,
      writable: true,
    });
  });

  it('renders with default labels', () => {
    setupClipboardMocks(true);

    render(<CopyToClipboardButton relativePath='/test-profile' />);

    expect(screen.getByRole('button')).toHaveTextContent('Copy URL');
  });

  it('renders with custom labels', () => {
    setupClipboardMocks(true);

    render(
      <CopyToClipboardButton
        relativePath='/test-profile'
        idleLabel='Copy Link'
        successLabel='Link Copied!'
        errorLabel='Copy Failed'
      />
    );

    expect(screen.getByRole('button')).toHaveTextContent('Copy Link');
  });

  it('successfully copies URL using clipboard API', async () => {
    setupClipboardMocks(true, true);

    render(<CopyToClipboardButton relativePath='/test-profile' />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await flushPromises();

    expect(button).toHaveTextContent('Copied!');
    expect(mockClipboard.writeText).toHaveBeenCalledWith(
      'https://jov.ie/test-profile'
    );
    expect(track).toHaveBeenCalledWith('profile_copy_url_click', {
      status: 'success',
    });
  });

  it('falls back to textarea method when clipboard API unavailable', async () => {
    setupClipboardMocks(false, false, true);

    // Mock DOM methods for fallback
    const mockTextarea = {
      focus: vi.fn(),
      select: vi.fn(),
      remove: vi.fn(), // Hook uses textarea.remove()
      value: '',
      style: {},
    };

    const mockAppendChild = vi.fn((node: Node | typeof mockTextarea) => {
      if (node === mockTextarea) {
        return node;
      }

      return originalAppendChild(node as Node);
    });
    const mockRemoveChild = vi.fn((node: Node | typeof mockTextarea) => {
      if (node === mockTextarea) {
        return node;
      }

      return originalRemoveChild(node as Node);
    });
    const mockCreateElement = vi
      .fn((tagName: string) => {
        if (tagName === 'textarea') {
          return mockTextarea as unknown as HTMLTextAreaElement;
        }

        return originalCreateElement(tagName);
      })
      .mockName('mockCreateElement');

    Object.defineProperty(document, 'createElement', {
      value: mockCreateElement,
      writable: true,
    });

    Object.defineProperty(document.body, 'appendChild', {
      value: mockAppendChild,
      writable: true,
    });

    Object.defineProperty(document.body, 'removeChild', {
      value: mockRemoveChild,
      writable: true,
    });

    render(<CopyToClipboardButton relativePath='/test-profile' />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await flushPromises();

    expect(button).toHaveTextContent('Copied!');
    expect(mockCreateElement).toHaveBeenCalledWith('textarea');
    expect(mockTextarea.value).toBe('https://jov.ie/test-profile');
    expect(mockTextarea.focus).toHaveBeenCalled();
    expect(mockTextarea.select).toHaveBeenCalled();
    expect(mockExecCommand).toHaveBeenCalledWith('copy');
    expect(mockAppendChild).toHaveBeenCalledWith(mockTextarea);
    expect(mockTextarea.remove).toHaveBeenCalled(); // Hook uses textarea.remove()
    expect(track).toHaveBeenCalledWith('profile_copy_url_click', {
      status: 'success',
    });
  });

  it('tries fallback when clipboard API fails', async () => {
    setupClipboardMocks(true, false, true);

    // Mock DOM methods for fallback
    const mockTextarea = {
      focus: vi.fn(),
      select: vi.fn(),
      remove: vi.fn(), // Hook uses textarea.remove()
      value: '',
      style: {},
    };

    const mockAppendChild = vi.fn((node: Node | typeof mockTextarea) => {
      if (node === mockTextarea) {
        return node;
      }

      return originalAppendChild(node as Node);
    });
    const mockRemoveChild = vi.fn((node: Node | typeof mockTextarea) => {
      if (node === mockTextarea) {
        return node;
      }

      return originalRemoveChild(node as Node);
    });
    const mockCreateElement = vi
      .fn((tagName: string) => {
        if (tagName === 'textarea') {
          return mockTextarea as unknown as HTMLTextAreaElement;
        }

        return originalCreateElement(tagName);
      })
      .mockName('mockCreateElement');

    Object.defineProperty(document, 'createElement', {
      value: mockCreateElement,
      writable: true,
    });

    Object.defineProperty(document.body, 'appendChild', {
      value: mockAppendChild,
      writable: true,
    });

    Object.defineProperty(document.body, 'removeChild', {
      value: mockRemoveChild,
      writable: true,
    });

    render(<CopyToClipboardButton relativePath='/test-profile' />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await flushPromises();

    expect(button).toHaveTextContent('Copied!');
    // Should try clipboard first, then fall back
    expect(mockClipboard.writeText).toHaveBeenCalledWith(
      'https://jov.ie/test-profile'
    );
    expect(mockCreateElement).toHaveBeenCalledWith('textarea');
    expect(mockExecCommand).toHaveBeenCalledWith('copy');
    expect(track).toHaveBeenCalledWith('profile_copy_url_click', {
      status: 'success',
    });
  });

  it('shows error when both methods fail', async () => {
    setupClipboardMocks(true, false, false);

    // Mock DOM methods for fallback that also fails
    const mockTextarea = {
      focus: vi.fn(),
      select: vi.fn(),
      remove: vi.fn(), // Hook uses textarea.remove()
      value: '',
      style: {},
    };

    const mockAppendChild = vi.fn((node: Node | typeof mockTextarea) => {
      if (node === mockTextarea) {
        return node;
      }

      return originalAppendChild(node as Node);
    });
    const mockRemoveChild = vi.fn((node: Node | typeof mockTextarea) => {
      if (node === mockTextarea) {
        return node;
      }

      return originalRemoveChild(node as Node);
    });
    const mockCreateElement = vi
      .fn((tagName: string) => {
        if (tagName === 'textarea') {
          return mockTextarea as unknown as HTMLTextAreaElement;
        }

        return originalCreateElement(tagName);
      })
      .mockName('mockCreateElement');

    Object.defineProperty(document, 'createElement', {
      value: mockCreateElement,
      writable: true,
    });

    Object.defineProperty(document.body, 'appendChild', {
      value: mockAppendChild,
      writable: true,
    });

    Object.defineProperty(document.body, 'removeChild', {
      value: mockRemoveChild,
      writable: true,
    });

    render(<CopyToClipboardButton relativePath='/test-profile' />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await flushPromises();

    expect(button).toHaveTextContent('Failed to copy');
    expect(track).toHaveBeenCalledWith('profile_copy_url_click', {
      status: 'error',
    });
  });

  it('shows error when fallback throws exception', async () => {
    setupClipboardMocks(false, false, false);

    // Mock DOM methods that throw errors
    const mockCreateElement = vi.fn((tagName: string) => {
      if (tagName === 'textarea') {
        throw new Error('createElement failed');
      }

      return originalCreateElement(tagName);
    });

    Object.defineProperty(document, 'createElement', {
      value: mockCreateElement,
      writable: true,
    });

    render(<CopyToClipboardButton relativePath='/test-profile' />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await flushPromises();

    expect(button).toHaveTextContent('Failed to copy');
    expect(track).toHaveBeenCalledWith('profile_copy_url_click', {
      status: 'error',
    });
  });

  it('has proper accessibility attributes', () => {
    setupClipboardMocks(true);

    render(<CopyToClipboardButton relativePath='/test-profile' />);

    const statusElement = screen.getByRole('status');
    expect(statusElement).toHaveAttribute('aria-live', 'polite');
    expect(statusElement).toHaveClass('sr-only');
  });

  it('updates accessibility status on success', async () => {
    setupClipboardMocks(true, true);

    render(<CopyToClipboardButton relativePath='/test-profile' />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await flushPromises();

    const statusElement = screen.getByRole('status');
    expect(statusElement).toHaveTextContent('Profile URL copied to clipboard');
  });

  it('updates accessibility status on error', async () => {
    setupClipboardMocks(true, false, false);

    render(<CopyToClipboardButton relativePath='/test-profile' />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await flushPromises();

    const statusElement = screen.getByRole('status');
    expect(statusElement).toHaveTextContent('Failed to copy profile URL');
  });
});
