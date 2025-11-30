'use client';

import { PhotoIcon } from '@heroicons/react/24/outline';
import { useCallback, useRef, useState } from 'react';
import { ArtistAvatar } from '@/components/atoms/ArtistAvatar';
import { useToast } from '@/components/molecules/ToastContainer';
import { cn } from '@/lib/utils';

interface AvatarUploadProps {
  currentAvatarUrl?: string | null;
  artistName: string;
  onUploadSuccess?: (imageUrl: string) => void;
  onUploadError?: (error: string) => void;
  className?: string;
}

export function AvatarUpload({
  currentAvatarUrl,
  artistName,
  onUploadSuccess,
  onUploadError,
  className,
}: AvatarUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Validate file type
      if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
        const errorMsg =
          'Please select a valid image file (JPEG, PNG, or WebP)';
        showToast({
          type: 'error',
          message: errorMsg,
        });
        onUploadError?.(errorMsg);
        return;
      }

      // Validate file size (4MB)
      if (file.size > 4 * 1024 * 1024) {
        const errorMsg = 'Image too large. Please select an image under 4MB.';
        showToast({
          type: 'error',
          message: errorMsg,
        });
        onUploadError?.(errorMsg);
        return;
      }

      // Show preview
      const reader = new FileReader();
      reader.onload = e => {
        setPreviewUrl(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      setIsUploading(true);

      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/images/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Upload failed');
        }

        const { blobUrl } = await response.json();

        showToast({
          type: 'success',
          message: 'Profile photo updated successfully!',
        });

        onUploadSuccess?.(blobUrl);
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : 'Upload failed';

        showToast({
          type: 'error',
          message: 'Failed to upload photo',
          action: {
            label: 'Try Again',
            onClick: () => fileInputRef.current?.click(),
          },
        });

        onUploadError?.(errorMsg);
        setPreviewUrl(null); // Reset preview on error
      } finally {
        setIsUploading(false);
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [showToast, onUploadSuccess, onUploadError]
  );

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const displayImageUrl = previewUrl || currentAvatarUrl;

  return (
    <div className={cn('flex items-start space-x-6', className)}>
      <div className='flex-shrink-0'>
        {displayImageUrl ? (
          <div className='relative'>
            <ArtistAvatar
              src={displayImageUrl}
              alt={artistName}
              name={artistName}
              size='lg'
              className={cn(
                'transition-opacity duration-200',
                isUploading && 'opacity-50'
              )}
            />
            {isUploading && (
              <div className='absolute inset-0 flex items-center justify-center bg-black/20 rounded-full'>
                <div className='w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin' />
              </div>
            )}
          </div>
        ) : (
          <div
            className={cn(
              'w-20 h-20 rounded-full bg-surface-2 flex items-center justify-center border-2 border-dashed border-subtle hover:border-accent transition-colors cursor-pointer group',
              isUploading && 'opacity-50 cursor-not-allowed'
            )}
            onClick={!isUploading ? handleUploadClick : undefined}
          >
            {isUploading ? (
              <div className='w-6 h-6 border-2 border-secondary border-t-transparent rounded-full animate-spin' />
            ) : (
              <PhotoIcon className='w-8 h-8 text-secondary group-hover:text-accent-token transition-colors' />
            )}
          </div>
        )}
      </div>

      <div className='flex-1 space-y-3'>
        <button
          type='button'
          onClick={handleUploadClick}
          disabled={isUploading}
          className={cn(
            'inline-flex items-center px-4 py-2 border border-subtle rounded-lg shadow-sm text-sm font-medium text-secondary bg-surface-1 hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 transition-colors',
            isUploading && 'opacity-50 cursor-not-allowed'
          )}
        >
          <PhotoIcon className='w-4 h-4 mr-2' />
          {isUploading ? 'Uploading...' : 'Upload photo'}
        </button>

        <p className='text-sm text-secondary'>
          JPG, PNG or WebP. Max size 4MB. Square images work best.
        </p>

        {/* Error state hint */}
        <p className='text-xs text-tertiary'>
          If upload fails, a default avatar will be used automatically.
        </p>
      </div>

      <input
        ref={fileInputRef}
        type='file'
        accept='image/jpeg,image/png,image/webp'
        onChange={handleFileChange}
        className='hidden'
        aria-label='Upload profile photo'
      />
    </div>
  );
}
