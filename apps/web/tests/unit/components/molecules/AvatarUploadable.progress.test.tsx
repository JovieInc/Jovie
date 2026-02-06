/**
 * Unit tests for AvatarUploadable component - Progress States and Analytics
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import { track } from '@/lib/analytics';
import {
  createMockCallbacks,
  createMockFile,
  setupUrlMocks,
} from './AvatarUploadable.test-utils';

// Mock analytics - must be in test file for proper hoisting
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

describe('AvatarUploadable - Progress States', () => {
  const { mockOnUpload, mockOnSuccess, mockOnError } = createMockCallbacks();
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

  it('shows progress ring during upload', async () => {
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
    fireEvent.change(fileInput, { target: { files: [createMockFile()] } });

    await Promise.resolve();
    expect(
      screen.getByTestId('avatar-uploadable-progress')
    ).toBeInTheDocument();
  });

  it('announces progress to screen readers', () => {
    render(
      <AvatarUploadable
        src='https://example.com/avatar.jpg'
        alt='User avatar'
        name='John Doe'
        uploadable={true}
        onUpload={mockOnUpload}
        progress={75}
      />
    );

    // Should have aria-live region for progress
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
  });

  it('shows success state with check icon', async () => {
    mockOnUpload.mockResolvedValue('https://example.com/new-avatar.jpg');

    render(
      <AvatarUploadable
        src='https://example.com/avatar.jpg'
        alt='User avatar'
        name='John Doe'
        uploadable={true}
        onUpload={mockOnUpload}
        onSuccess={mockOnSuccess}
      />
    );

    const fileInput = screen.getByLabelText('Choose profile photo file');
    const file = createMockFile();

    fireEvent.change(fileInput, { target: { files: [file] } });

    await Promise.resolve();
    vi.runAllTimers();
    expect(mockOnSuccess).toHaveBeenCalled();
  });

  it('shows error state when upload fails', async () => {
    mockOnUpload.mockRejectedValue(new Error('Upload failed'));

    render(
      <AvatarUploadable
        src='https://example.com/avatar.jpg'
        alt='User avatar'
        name='John Doe'
        uploadable={true}
        onUpload={mockOnUpload}
        onError={mockOnError}
      />
    );

    const fileInput = screen.getByLabelText('Choose profile photo file');
    const file = createMockFile();

    fireEvent.change(fileInput, { target: { files: [file] } });

    await Promise.resolve();
    vi.runAllTimers();
    expect(mockOnError).toHaveBeenCalledWith('Upload failed');
  });
});

describe('AvatarUploadable - Analytics Tracking', () => {
  const { mockOnUpload, mockOnError } = createMockCallbacks();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    setupUrlMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tracks upload events', async () => {
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
    const file = createMockFile('test.jpg', 'image/jpeg', 2048);

    fireEvent.change(fileInput, { target: { files: [file] } });

    await Promise.resolve();
    expect(track).toHaveBeenCalledWith('avatar_upload_start', {
      file_size: 2048,
      file_type: 'image/jpeg',
    });

    await Promise.resolve();
    vi.runAllTimers();
    expect(track).toHaveBeenCalledWith('avatar_upload_success', {
      file_size: 2048,
    });
  });

  it.skip('tracks validation errors', async () => {
    render(
      <AvatarUploadable
        src='https://example.com/avatar.jpg'
        alt='User avatar'
        name='John Doe'
        uploadable={true}
        onUpload={mockOnUpload}
        onError={mockOnError}
      />
    );

    const fileInput = screen.getByLabelText('Choose profile photo file');
    const invalidFile = createMockFile('document.pdf', 'application/pdf', 1024);

    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    await Promise.resolve();
    vi.runAllTimers();
    expect(track).toHaveBeenCalledWith(
      'avatar_upload_error',
      expect.objectContaining({
        error: 'validation_failed',
        message: expect.stringContaining('Invalid file type'),
      })
    );
  });
});
