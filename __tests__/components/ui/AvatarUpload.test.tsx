import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AvatarUpload } from '@/components/ui/AvatarUpload';

// Mock the toast context
const mockShowToast = vi.fn();
vi.mock('@/components/ui/ToastContainer', () => ({
  useToast: () => ({
    showToast: mockShowToast,
    hideToast: vi.fn(),
    clearToasts: vi.fn(),
  }),
}));

// Mock fetch
global.fetch = vi.fn();

// Mock file reading
global.FileReader = vi.fn(() => ({
  readAsDataURL: vi.fn(),
  onload: null,
})) as any;

describe('AvatarUpload - Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show error toast for invalid file type', async () => {
    render(
      <AvatarUpload
        artistName="Test Artist"
        currentAvatarUrl="/test-avatar.jpg"
      />
    );

    const fileInput = screen.getByLabelText('Upload profile photo');
    
    // Create a fake file with invalid type
    const invalidFile = new File(['test'], 'test.txt', { type: 'text/plain' });
    
    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith({
        type: 'error',
        message: 'Please select a valid image file (JPEG, PNG, or WebP)',
      });
    });
  });

  it('should show error toast for file too large', async () => {
    render(
      <AvatarUpload
        artistName="Test Artist"
        currentAvatarUrl="/test-avatar.jpg"
      />
    );

    const fileInput = screen.getByLabelText('Upload profile photo');
    
    // Create a fake file that's too large (5MB)
    const largeFile = new File(['x'.repeat(5 * 1024 * 1024)], 'large.jpg', { 
      type: 'image/jpeg' 
    });
    
    fireEvent.change(fileInput, { target: { files: [largeFile] } });

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith({
        type: 'error',
        message: 'Image too large. Please select an image under 4MB.',
      });
    });
  });

  it('should show success toast on successful upload', async () => {
    // Mock successful API response
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ blobUrl: '/new-avatar.jpg' }),
    });

    const onUploadSuccess = vi.fn();

    render(
      <AvatarUpload
        artistName="Test Artist"
        currentAvatarUrl="/test-avatar.jpg"
        onUploadSuccess={onUploadSuccess}
      />
    );

    const fileInput = screen.getByLabelText('Upload profile photo');
    
    // Create a valid file
    const validFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    
    fireEvent.change(fileInput, { target: { files: [validFile] } });

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith({
        type: 'success',
        message: 'Profile photo updated successfully!',
      });
    });

    expect(onUploadSuccess).toHaveBeenCalledWith('/new-avatar.jpg');
  });

  it('should show error toast on upload failure', async () => {
    // Mock failed API response
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Upload failed' }),
    });

    render(
      <AvatarUpload
        artistName="Test Artist"
        currentAvatarUrl="/test-avatar.jpg"
      />
    );

    const fileInput = screen.getByLabelText('Upload profile photo');
    
    // Create a valid file
    const validFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    
    fireEvent.change(fileInput, { target: { files: [validFile] } });

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith({
        type: 'error',
        message: 'Failed to upload photo',
        action: {
          label: 'Try Again',
          onClick: expect.any(Function),
        },
      });
    });
  });

  it('should display upload instructions', () => {
    render(
      <AvatarUpload
        artistName="Test Artist"
        currentAvatarUrl="/test-avatar.jpg"
      />
    );

    expect(screen.getByText('JPG, PNG or WebP. Max size 4MB. Square images work best.')).toBeInTheDocument();
    expect(screen.getByText('If upload fails, a default avatar will be used automatically.')).toBeInTheDocument();
  });
});