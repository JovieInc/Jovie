/**
 * Unit tests for AvatarUploadable component - Drag and Drop
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import {
  createMockCallbacks,
  createMockFile,
  setupUrlMocks,
} from './AvatarUploadable.test-utils';

describe('AvatarUploadable - Drag and Drop', () => {
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

  it('handles drag enter and shows drag overlay', async () => {
    render(
      <AvatarUploadable
        src='https://example.com/avatar.jpg'
        alt='User avatar'
        name='John Doe'
        uploadable={true}
        onUpload={mockOnUpload}
      />
    );

    const container = screen.getByRole('button');

    fireEvent.dragEnter(container, {
      dataTransfer: {
        files: [createMockFile()],
      },
    });

    await Promise.resolve();
    expect(
      screen.getByTestId('avatar-uploadable-drag-overlay')
    ).toBeInTheDocument();
  });

  it('handles file drop and triggers upload', async () => {
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

    const container = screen.getByRole('button');
    const file = createMockFile('dropped.jpg', 'image/jpeg', 1024);

    fireEvent.drop(container, {
      dataTransfer: {
        files: [file],
      },
    });

    await Promise.resolve();
    expect(mockOnUpload).toHaveBeenCalledWith(file);
  });

  it('prevents default drag behavior', () => {
    render(
      <AvatarUploadable
        src='https://example.com/avatar.jpg'
        alt='User avatar'
        name='John Doe'
        uploadable={true}
        onUpload={mockOnUpload}
      />
    );

    const container = screen.getByRole('button');

    const dragOverEvent = new Event('dragover', {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(container, dragOverEvent);
    expect(dragOverEvent.defaultPrevented).toBe(true);

    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { files: [createMockFile()] },
      configurable: true,
    });
    fireEvent(container, dropEvent);
    expect(dropEvent.defaultPrevented).toBe(true);
  });
});
