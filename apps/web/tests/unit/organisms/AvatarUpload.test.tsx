import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { AvatarUpload } from '@/components/organisms/AvatarUpload';
import { fastRender } from '@/tests/utils/fast-render';

// Mock Sonner toast with vi.hoisted for proper setup
const mockToast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  loading: vi.fn(),
  dismiss: vi.fn(),
  message: vi.fn(),
  promise: vi.fn(),
  custom: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: mockToast,
  Toaster: () => null,
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
    const fetchMock = global.fetch as unknown as Mock;
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Upload failed' }),
    });
    // jsdom does not implement these by default; mock for preview logic
    // @ts-expect-error partial URL mock for tests
    global.URL = {
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    };
  });

  it('should show error toast for invalid file type', async () => {
    fastRender(
      <AvatarUpload
        artistName='Test Artist'
        currentAvatarUrl='/test-avatar.jpg'
      />
    );

    const fileInput = screen.getByLabelText('Choose profile photo file');

    const invalidFile = new File(['test'], 'test.txt', { type: 'text/plain' });

    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid file type')
      );
    });
  });

  it('should show error toast for file too large', async () => {
    fastRender(
      <AvatarUpload
        artistName='Test Artist'
        currentAvatarUrl='/test-avatar.jpg'
      />
    );

    const fileInput = screen.getByLabelText('Choose profile photo file');

    const largeFile = new File(['x'], 'large.jpg', { type: 'image/jpeg' });
    Object.defineProperty(largeFile, 'size', {
      value: 30 * 1024 * 1024,
    });

    fireEvent.change(fileInput, { target: { files: [largeFile] } });

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        expect.stringContaining('File too large')
      );
    });
  });

  it('should show success toast on successful upload', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ blobUrl: '/new-avatar.jpg' }),
    });

    const onUploadSuccess = vi.fn();

    fastRender(
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
      expect(mockToast.success).toHaveBeenCalledWith('Profile photo updated');
    });

    expect(onUploadSuccess).toHaveBeenCalledWith('/new-avatar.jpg');
  });

  it('should show error toast on upload failure', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Upload failed' }),
    });

    fastRender(
      <AvatarUpload
        artistName='Test Artist'
        currentAvatarUrl='/test-avatar.jpg'
      />
    );

    const fileInput = screen.getByLabelText('Choose profile photo file');
    const validFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

    fireEvent.change(fileInput, { target: { files: [validFile] } });

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Upload failed');
    });
  });

  it('should display upload instructions', () => {
    fastRender(
      <AvatarUpload
        artistName='Test Artist'
        currentAvatarUrl='/test-avatar.jpg'
      />
    );

    expect(
      screen.getByText(/Auto-optimized to AVIF\/WebP/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Max size 25MB/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        'If upload fails, a default avatar will be used automatically.'
      )
    ).toBeInTheDocument();
  });
});
