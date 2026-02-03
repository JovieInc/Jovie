/**
 * Unit tests for AvatarUploadable component - Accessibility
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import {
  createMockCallbacks,
  createMockFile,
  setupUrlMocks,
} from './AvatarUploadable.test-utils';

describe('AvatarUploadable - Accessibility', () => {
  const { mockOnUpload } = createMockCallbacks();
  let restoreUrlMocks: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    restoreUrlMocks = setupUrlMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreUrlMocks?.();
  });

  it('has proper ARIA labels and roles', () => {
    render(
      <AvatarUploadable
        src='https://example.com/avatar.jpg'
        alt='User avatar'
        name='John Doe'
        uploadable={true}
        onUpload={mockOnUpload}
      />
    );

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Upload profile photo');

    const fileInput = screen.getByLabelText('Choose profile photo file');
    expect(fileInput).toHaveAttribute(
      'aria-label',
      'Choose profile photo file'
    );
  });

  it('announces status changes to screen readers', async () => {
    // Use immediately resolving mock for simpler async handling
    mockOnUpload.mockResolvedValue('https://example.com/new-avatar.jpg');

    render(
      <AvatarUploadable
        src='https://example.com/avatar.jpg'
        alt='User avatar'
        name='John Doe'
        uploadable={true}
        onUpload={mockOnUpload}
      />
    );

    const fileInput = screen.getByLabelText('Choose profile photo file');
    const file = createMockFile();

    // Trigger file selection
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Flush microtasks to let the promise resolve
    await act(async () => {
      await Promise.resolve();
    });

    // Advance timers to process any setTimeout calls
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // Now check for the success announcement
    const successAnnouncement = screen.getByText(
      'Profile photo uploaded successfully'
    );
    expect(successAnnouncement).toBeInTheDocument();
    expect(successAnnouncement).toHaveAttribute('aria-live', 'polite');
  });

  it('has keyboard focus management', () => {
    render(
      <AvatarUploadable
        src='https://example.com/avatar.jpg'
        alt='User avatar'
        name='John Doe'
        uploadable={true}
        onUpload={mockOnUpload}
      />
    );

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('tabIndex', '0');
  });
});
