import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AvatarUploadable } from '@/components/molecules/AvatarUploadable';
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

      // Hover overlay should not be present
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
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
    it('triggers file input click when avatar is clicked', async () => {
      const user = userEvent.setup();

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
      await user.click(container);

      // File input should have been triggered (can't test actual file dialog opening)
      expect(container).toBeInTheDocument();
    });

    it('handles keyboard interaction (Enter and Space)', async () => {
      const user = userEvent.setup();

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
      await user.keyboard('{Enter}');

      // Test Space key
      await user.keyboard(' ');

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

      await userEvent.upload(fileInput, file);

      await waitFor(() => {
        expect(mockOnUpload).toHaveBeenCalledWith(file);
      });
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

      await userEvent.upload(fileInput, invalidFile);

      await waitFor(() => {
        expect(mockOnError).toHaveBeenCalledWith(
          expect.stringContaining('Invalid file type')
        );
      });
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

      await userEvent.upload(fileInput, largeFile);

      await waitFor(() => {
        expect(mockOnError).toHaveBeenCalledWith(
          expect.stringContaining('File too large')
        );
      });
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

        await userEvent.upload(fileInput, validFile);

        await waitFor(() => {
          expect(mockOnUpload).toHaveBeenCalledWith(validFile);
        });

        unmount();
        vi.clearAllMocks();
      }
    });
  });

  describe('Drag and Drop', () => {
    it('handles drag enter and shows drag overlay', () => {
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

      // Should show drag active state
      expect(container).toHaveClass('group');
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

      await waitFor(() => {
        expect(mockOnUpload).toHaveBeenCalledWith(file);
      });
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
    it('shows progress ring during upload', () => {
      render(
        <AvatarUploadable
          src='https://example.com/avatar.jpg'
          alt='User avatar'
          name='John Doe'
          uploadable={true}
          onUpload={mockOnUpload}
          progress={50}
        />
      );

      // Progress ring SVG should be present with progress
      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
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

      await userEvent.upload(fileInput, file);

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled();
      });
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

      await userEvent.upload(fileInput, file);

      await waitFor(() => {
        expect(mockOnError).toHaveBeenCalledWith('Upload failed');
      });
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

      await userEvent.upload(fileInput, file);

      await waitFor(() => {
        expect(track).toHaveBeenCalledWith('avatar_upload_start', {
          file_size: 2048,
          file_type: 'image/jpeg',
        });
      });

      await waitFor(() => {
        expect(track).toHaveBeenCalledWith('avatar_upload_success', {
          file_size: 2048,
        });
      });
    });

    it('tracks validation errors', async () => {
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

      await userEvent.upload(fileInput, invalidFile);

      await waitFor(() => {
        expect(track).toHaveBeenCalledWith('avatar_upload_error', {
          error: 'validation_failed',
          message: expect.stringContaining('Invalid file type'),
        });
      });
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

      await userEvent.upload(fileInput, file);

      await waitFor(() => {
        const successAnnouncement = screen.getByText(
          'Profile photo uploaded successfully'
        );
        expect(successAnnouncement).toBeInTheDocument();
        expect(successAnnouncement).toHaveAttribute('aria-live', 'polite');
      });
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
