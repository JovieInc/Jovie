/**
 * Unit tests for AvatarUploadable component - File validation
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import './AvatarUploadable.test-utils';

import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import {
  createMockCallbacks,
  createMockFile,
  setupUrlMocks,
} from './AvatarUploadable.test-utils';

describe('AvatarUploadable - File Validation', () => {
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

  it('calls onUpload when file is selected', async () => {
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
    const file = createMockFile('avatar.jpg', 'image/jpeg', 2048);

    fireEvent.change(fileInput, { target: { files: [file] } });

    await Promise.resolve();
    expect(mockOnUpload).toHaveBeenCalledWith(file);
  });

  it('validates file type and shows error for invalid types', async () => {
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
    expect(mockOnError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid file type')
    );
  });

  it('validates file size and shows error for large files', async () => {
    const maxSize = 5 * 1024 * 1024; // 5MB

    render(
      <AvatarUploadable
        src='https://example.com/avatar.jpg'
        alt='User avatar'
        name='John Doe'
        uploadable={true}
        onUpload={mockOnUpload}
        onError={mockOnError}
        maxFileSize={maxSize}
      />
    );

    const fileInput = screen.getByLabelText('Choose profile photo file');
    const largeFile = createMockFile(
      'large.jpg',
      'image/jpeg',
      6 * 1024 * 1024
    ); // 6MB

    fireEvent.change(fileInput, { target: { files: [largeFile] } });

    await Promise.resolve();
    expect(mockOnError).toHaveBeenCalledWith(
      expect.stringContaining('File too large')
    );
  });

  it('accepts valid file types', async () => {
    mockOnUpload.mockResolvedValue('https://example.com/new-avatar.jpg');

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];

    for (const type of validTypes) {
      const { unmount } = render(
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
      const validFile = createMockFile(
        `test.${type.split('/')[1]}`,
        type,
        1024
      );

      fireEvent.change(fileInput, { target: { files: [validFile] } });

      await Promise.resolve();
      expect(mockOnUpload).toHaveBeenCalledWith(validFile);

      unmount();
      vi.clearAllMocks();
    }
  });

  it('accepts HEIC by default to match API support', async () => {
    mockOnUpload.mockResolvedValue('https://example.com/new-avatar.jpg');

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
    const heicFile = createMockFile('photo.heic', 'image/heic', 2048);

    fireEvent.change(fileInput, { target: { files: [heicFile] } });

    await Promise.resolve();
    expect(mockOnUpload).toHaveBeenCalledWith(heicFile);
    expect(mockOnError).not.toHaveBeenCalled();
  });

  it('can be configured to reject HEIC when disabled upstream', async () => {
    render(
      <AvatarUploadable
        src='https://example.com/avatar.jpg'
        alt='User avatar'
        name='John Doe'
        uploadable={true}
        onUpload={mockOnUpload}
        onError={mockOnError}
        acceptedTypes={['image/jpeg', 'image/png', 'image/webp']}
      />
    );

    const fileInput = screen.getByLabelText('Choose profile photo file');
    const heicFile = createMockFile('photo.heic', 'image/heic', 2048);

    fireEvent.change(fileInput, { target: { files: [heicFile] } });

    await Promise.resolve();
    expect(mockOnError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid file type')
    );
    expect(mockOnUpload).not.toHaveBeenCalled();
  });

  it('enforces 25MB default max file size', async () => {
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
    const largeFile = createMockFile(
      'large.jpg',
      'image/jpeg',
      30 * 1024 * 1024
    );

    fireEvent.change(fileInput, { target: { files: [largeFile] } });

    await Promise.resolve();
    expect(mockOnError).toHaveBeenCalledWith(
      expect.stringContaining('File too large')
    );
    expect(mockOnUpload).not.toHaveBeenCalled();
  });
});
