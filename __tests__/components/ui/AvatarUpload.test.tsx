import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AvatarUpload } from '@/components/organisms/AvatarUpload';

// Mock the toast context
const mockShowToast = vi.fn();
vi.mock('@/components/molecules/ToastContainer', () => ({
  useToast: () => ({
    showToast: mockShowToast,
    hideToast: vi.fn(),
    clearToasts: vi.fn(),
  }),
}));

// Mock analytics
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

// Mock fetch
global.fetch = vi.fn() as any;

describe('AvatarUpload - Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show error toast for invalid file type', async () => {
    render(
      <AvatarUpload
        artistName='Test Artist'
        currentAvatarUrl='/test-avatar.jpg'
      />
    );

    const fileInput = screen.getByLabelText('Choose profile photo file');

    const invalidFile = new File(['test'], 'test.txt', { type: 'text/plain' });

    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: expect.stringContaining('Invalid file type'),
        })
      );
    });
  });

  it('should show error toast for file too large', async () => {
    render(
      <AvatarUpload
        artistName='Test Artist'
        currentAvatarUrl='/test-avatar.jpg'
      />
    );

    const fileInput = screen.getByLabelText('Choose profile photo file');

    const largeFile = new File(['x'.repeat(5 * 1024 * 1024)], 'large.jpg', {
      type: 'image/jpeg',
    });

    fireEvent.change(fileInput, { target: { files: [largeFile] } });

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: expect.stringContaining('File too large'),
        })
      );
    });
  });

  it('should show success toast on successful upload', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ blobUrl: '/new-avatar.jpg' }),
    });

    const onUploadSuccess = vi.fn();

    render(
      <AvatarUpload
        artistName='Test Artist'
        currentAvatarUrl='/test-avatar.jpg'
        onUploadSuccess={onUploadSuccess}
      />
    );

    const fileInput = screen.getByLabelText('Choose profile photo file');
    const validFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

    fireEvent.change(fileInput, { target: { files: [validFile] } });

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          message: 'Profile photo updated successfully!',
        })
      );
    });

    expect(onUploadSuccess).toHaveBeenCalledWith('/new-avatar.jpg');
  });

  it('should show error toast on upload failure', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Upload failed' }),
    });

    render(
      <AvatarUpload
        artistName='Test Artist'
        currentAvatarUrl='/test-avatar.jpg'
      />
    );

    const fileInput = screen.getByLabelText('Choose profile photo file');
    const validFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

    fireEvent.change(fileInput, { target: { files: [validFile] } });

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: 'Upload failed',
        })
      );
    });
  });

  it('should display upload instructions', () => {
    render(
      <AvatarUpload
        artistName='Test Artist'
        currentAvatarUrl='/test-avatar.jpg'
      />
    );

    expect(
      screen.getByText(
        'JPG, PNG or WebP. Max size 4MB. Square images work best.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'If upload fails, a default avatar will be used automatically.'
      )
    ).toBeInTheDocument();
  });
});
