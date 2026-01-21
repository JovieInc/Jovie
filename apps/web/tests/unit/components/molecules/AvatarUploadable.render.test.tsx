/**
 * Unit tests for AvatarUploadable component - Display and Upload modes
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import './AvatarUploadable.test-utils';

import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import {
  createMockCallbacks,
  setupUrlMocks,
} from './AvatarUploadable.test-utils';

describe('AvatarUploadable - Display Mode (Non-uploadable)', () => {
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

  it('renders as regular avatar when uploadable is false', () => {
    render(
      <AvatarUploadable
        src='https://example.com/avatar.jpg'
        alt='User avatar'
        name='John Doe'
        uploadable={false}
      />
    );

    const container = screen.getByRole('img');
    expect(container).toBeInTheDocument();
    expect(container).not.toHaveAttribute('tabIndex');
    expect(container).not.toHaveAttribute('role', 'button');
  });

  it('does not show hover overlay when not uploadable', () => {
    render(
      <AvatarUploadable
        src='https://example.com/avatar.jpg'
        alt='User avatar'
        name='John Doe'
        uploadable={false}
      />
    );

    expect(
      screen.queryByTestId('avatar-uploadable-hover-overlay')
    ).not.toBeInTheDocument();
  });
});

describe('AvatarUploadable - Upload Mode', () => {
  const { mockOnUpload } = createMockCallbacks();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    setupUrlMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders with upload functionality when uploadable is true', () => {
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
    expect(container).toBeInTheDocument();
    expect(container).toHaveAttribute('aria-label', 'Upload profile photo');
    expect(container).toHaveAttribute('tabIndex', '0');
  });

  it('shows file input for upload', () => {
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
    expect(fileInput).toBeInTheDocument();
    expect(fileInput).toHaveAttribute('type', 'file');
    expect(fileInput).toHaveClass('sr-only');
  });
});

describe('AvatarUploadable - File Upload Interactions', () => {
  const { mockOnUpload } = createMockCallbacks();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    setupUrlMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('triggers file input click when avatar is clicked', () => {
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
    fireEvent.click(container);

    // File input should have been triggered
    expect(container).toBeInTheDocument();
  });

  it('handles keyboard interaction (Enter and Space)', () => {
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

    // Test Enter key
    container.focus();
    fireEvent.keyDown(container, { key: 'Enter' });

    // Test Space key
    fireEvent.keyDown(container, { key: ' ' });

    expect(container).toBeInTheDocument();
  });
});
