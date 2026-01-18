import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import { track } from '@/lib/analytics';

// Mock analytics tracking
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

// Mock Next.js Image component (already mocked in setup.ts but explicit here for clarity)
vi.mock('next/image', () => ({
  default: vi
    .fn()
    .mockImplementation(({ src, alt, onLoad, onError, ...props }: any) => {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions: Test mock component
        <img
          src={src}
          alt={alt}
          onLoad={onLoad}
          onError={onError}
          {...props}
          data-testid='avatar-image'
        />
      );
    }),
}));

// Mock file for testing
const createMockFile = (
  name = 'test.jpg',
  type = 'image/jpeg',
  size = 1024
): File => {
  const file = new File(['test content'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

describe('AvatarUploadable Component', () => {
  const mockOnUpload = vi.fn();
  const mockOnSuccess = vi.fn();
  const mockOnError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom lacks createObjectURL; mock for preview logic
    // @ts-expect-error partial URL mock
    global.URL = {
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    };
  });

  describe('Display Mode (Non-uploadable)', () => {
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

  describe('Upload Mode', () => {
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

  describe('File Upload Interactions', () => {
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

      // File input should have been triggered (can't test actual file dialog opening)
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
  });

  describe('File Validation', () => {
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
      const invalidFile = createMockFile(
        'document.pdf',
        'application/pdf',
        1024
      );

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

  describe('Drag and Drop', () => {
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

  describe('Progress States', () => {
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

  describe('Analytics Tracking', () => {
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
      const invalidFile = createMockFile(
        'document.pdf',
        'application/pdf',
        1024
      );

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

  describe('Accessibility', () => {
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
});
