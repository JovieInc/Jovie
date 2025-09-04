import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, expect } from 'vitest';
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

describe('CopyToClipboardButton', () => {
  const { track } = require('@/lib/analytics');
  
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders with default labels', () => {
    setupClipboardMocks(true);
    
    render(<CopyToClipboardButton relativePath="/test-profile" />);
    
    expect(screen.getByRole('button')).toHaveTextContent('Copy URL');
  });

  it('renders with custom labels', () => {
    setupClipboardMocks(true);
    
    render(
      <CopyToClipboardButton 
        relativePath="/test-profile"
        idleLabel="Copy Link"
        successLabel="Link Copied!"
        errorLabel="Copy Failed"
      />
    );
    
    expect(screen.getByRole('button')).toHaveTextContent('Copy Link');
  });

  it('successfully copies URL using clipboard API', async () => {
    setupClipboardMocks(true, true);
    
    render(<CopyToClipboardButton relativePath="/test-profile" />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(button).toHaveTextContent('✓ Copied!');
    });
    
    expect(mockClipboard.writeText).toHaveBeenCalledWith('https://jov.ie/test-profile');
    expect(track).toHaveBeenCalledWith('profile_copy_url_click', { status: 'success' });
    
    // Check that it returns to idle state after timeout
    vi.runAllTimers();
    
    await waitFor(() => {
      expect(button).toHaveTextContent('Copy URL');
    });
  });

  it('falls back to textarea method when clipboard API unavailable', async () => {
    setupClipboardMocks(false, false, true);
    
    // Mock DOM methods for fallback
    const mockTextarea = {
      focus: vi.fn(),
      select: vi.fn(),
      value: '',
      style: {},
    };
    
    const mockAppendChild = vi.fn();
    const mockRemoveChild = vi.fn();
    const mockCreateElement = vi.fn().mockReturnValue(mockTextarea);
    
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
    
    render(<CopyToClipboardButton relativePath="/test-profile" />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(button).toHaveTextContent('✓ Copied!');
    });
    
    expect(mockCreateElement).toHaveBeenCalledWith('textarea');
    expect(mockTextarea.value).toBe('https://jov.ie/test-profile');
    expect(mockTextarea.focus).toHaveBeenCalled();
    expect(mockTextarea.select).toHaveBeenCalled();
    expect(mockExecCommand).toHaveBeenCalledWith('copy');
    expect(mockAppendChild).toHaveBeenCalledWith(mockTextarea);
    expect(mockRemoveChild).toHaveBeenCalledWith(mockTextarea);
    expect(track).toHaveBeenCalledWith('profile_copy_url_click', { status: 'success' });
  });

  it('tries fallback when clipboard API fails', async () => {
    setupClipboardMocks(true, false, true);
    
    // Mock DOM methods for fallback
    const mockTextarea = {
      focus: vi.fn(),
      select: vi.fn(),
      value: '',
      style: {},
    };
    
    const mockAppendChild = vi.fn();
    const mockRemoveChild = vi.fn();
    const mockCreateElement = vi.fn().mockReturnValue(mockTextarea);
    
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
    
    render(<CopyToClipboardButton relativePath="/test-profile" />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(button).toHaveTextContent('✓ Copied!');
    });
    
    // Should try clipboard first, then fall back
    expect(mockClipboard.writeText).toHaveBeenCalledWith('https://jov.ie/test-profile');
    expect(mockCreateElement).toHaveBeenCalledWith('textarea');
    expect(mockExecCommand).toHaveBeenCalledWith('copy');
    expect(track).toHaveBeenCalledWith('profile_copy_url_click', { status: 'success' });
  });

  it('shows error when both methods fail', async () => {
    setupClipboardMocks(true, false, false);
    
    // Mock DOM methods for fallback that also fails
    const mockTextarea = {
      focus: vi.fn(),
      select: vi.fn(),
      value: '',
      style: {},
    };
    
    const mockAppendChild = vi.fn();
    const mockRemoveChild = vi.fn();
    const mockCreateElement = vi.fn().mockReturnValue(mockTextarea);
    
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
    
    render(<CopyToClipboardButton relativePath="/test-profile" />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(button).toHaveTextContent('Failed to copy');
    });
    
    expect(track).toHaveBeenCalledWith('profile_copy_url_click', { status: 'error' });
  });

  it('shows error when fallback throws exception', async () => {
    setupClipboardMocks(false, false, false);
    
    // Mock DOM methods that throw errors
    const mockCreateElement = vi.fn().mockImplementation(() => {
      throw new Error('createElement failed');
    });
    
    Object.defineProperty(document, 'createElement', {
      value: mockCreateElement,
      writable: true,
    });
    
    render(<CopyToClipboardButton relativePath="/test-profile" />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(button).toHaveTextContent('Failed to copy');
    });
    
    expect(track).toHaveBeenCalledWith('profile_copy_url_click', { status: 'error' });
  });

  it('has proper accessibility attributes', () => {
    setupClipboardMocks(true);
    
    render(<CopyToClipboardButton relativePath="/test-profile" />);
    
    const statusElement = screen.getByRole('status');
    expect(statusElement).toHaveAttribute('aria-live', 'polite');
    expect(statusElement).toHaveClass('sr-only');
  });

  it('updates accessibility status on success', async () => {
    setupClipboardMocks(true, true);
    
    render(<CopyToClipboardButton relativePath="/test-profile" />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    await waitFor(() => {
      const statusElement = screen.getByRole('status');
      expect(statusElement).toHaveTextContent('Profile URL copied to clipboard');
    });
  });

  it('updates accessibility status on error', async () => {
    setupClipboardMocks(true, false, false);
    
    render(<CopyToClipboardButton relativePath="/test-profile" />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    await waitFor(() => {
      const statusElement = screen.getByRole('status');
      expect(statusElement).toHaveTextContent('Failed to copy profile URL');
    });
  });
});