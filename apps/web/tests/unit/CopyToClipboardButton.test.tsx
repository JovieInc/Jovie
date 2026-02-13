import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CopyToClipboardButton } from '@/components/dashboard/molecules/CopyToClipboardButton';
import { track } from '@/lib/analytics';

import {
  getOriginalCreateElement,
  restoreDomMethods,
  setupClipboardMocks,
  setupTextareaDomMocks,
} from '../test-utils';

// Mock the analytics module
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

// Mock platform detection
vi.mock('@/lib/utils/platform-detection', () => ({
  getBaseUrl: vi.fn(() => 'https://jov.ie'),
}));

// Use fake timers for faster tests
vi.useFakeTimers();

// Helper to flush promises and timers
const flushPromises = async () => {
  await act(async () => {
    await Promise.resolve();
    vi.advanceTimersByTime(0);
  });
};

describe('CopyToClipboardButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreDomMethods();
  });

  it('renders with default labels', () => {
    setupClipboardMocks({ available: true });

    render(<CopyToClipboardButton relativePath='/test-profile' />);

    expect(screen.getByRole('button')).toHaveTextContent('Copy URL');
  });

  it('renders with custom labels', () => {
    setupClipboardMocks({ available: true });

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
    const { mockWriteText } = setupClipboardMocks({
      available: true,
      success: true,
    });

    render(<CopyToClipboardButton relativePath='/test-profile' />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await flushPromises();

    expect(button).toHaveTextContent('Copied!');
    expect(mockWriteText).toHaveBeenCalledWith('https://jov.ie/test-profile');
    expect(track).toHaveBeenCalledWith('profile_copy_url_click', {
      status: 'success',
    });
  });

  it('falls back to textarea method when clipboard API unavailable', async () => {
    const { mockExecCommand } = setupClipboardMocks({
      available: false,
      execCommandSuccess: true,
    });
    const { mockTextarea, mockCreateElement, mockAppendChild } =
      setupTextareaDomMocks();

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
    expect(mockTextarea.remove).toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith('profile_copy_url_click', {
      status: 'success',
    });
  });

  it('tries fallback when clipboard API fails', async () => {
    const { mockWriteText, mockExecCommand } = setupClipboardMocks({
      available: true,
      success: false,
      execCommandSuccess: true,
    });
    const { mockCreateElement } = setupTextareaDomMocks();

    render(<CopyToClipboardButton relativePath='/test-profile' />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await flushPromises();

    expect(button).toHaveTextContent('Copied!');
    // Should try clipboard first, then fall back
    expect(mockWriteText).toHaveBeenCalledWith('https://jov.ie/test-profile');
    expect(mockCreateElement).toHaveBeenCalledWith('textarea');
    expect(mockExecCommand).toHaveBeenCalledWith('copy');
    expect(track).toHaveBeenCalledWith('profile_copy_url_click', {
      status: 'success',
    });
  });

  it('shows error when both methods fail', async () => {
    setupClipboardMocks({
      available: true,
      success: false,
      execCommandSuccess: false,
    });
    setupTextareaDomMocks();

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
    setupClipboardMocks({
      available: false,
      execCommandSuccess: false,
    });

    // Get original createElement before mocking to avoid recursion
    const originalCreateElement = getOriginalCreateElement();

    // Mock createElement to throw for textarea
    const mockCreateElement = vi.fn((tagName: string) => {
      if (tagName === 'textarea') {
        throw new Error('createElement failed');
      }
      return originalCreateElement(tagName);
    });

    Object.defineProperty(document, 'createElement', {
      value: mockCreateElement,
      writable: true,
      configurable: true,
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
    setupClipboardMocks({ available: true });

    render(<CopyToClipboardButton relativePath='/test-profile' />);

    const statusElement = screen.getByRole('status');
    expect(statusElement).toHaveAttribute('aria-live', 'polite');
    expect(statusElement).toHaveClass('sr-only');
  });

  it('updates accessibility status on success', async () => {
    setupClipboardMocks({ available: true, success: true });

    render(<CopyToClipboardButton relativePath='/test-profile' />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await flushPromises();

    const statusElement = screen.getByRole('status');
    expect(statusElement).toHaveTextContent('Profile URL copied to clipboard');
  });

  it('updates accessibility status on error', async () => {
    setupClipboardMocks({
      available: true,
      success: false,
      execCommandSuccess: false,
    });

    render(<CopyToClipboardButton relativePath='/test-profile' />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await flushPromises();

    const statusElement = screen.getByRole('status');
    expect(statusElement).toHaveTextContent('Failed to copy profile URL');
  });
});
