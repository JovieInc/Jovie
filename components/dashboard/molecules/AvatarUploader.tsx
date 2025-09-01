'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';

// Constants
const POLLING_INTERVAL_MS = 2000; // Poll status every 2 seconds
const POLLING_TIMEOUT_MS = 120000; // Stop polling after 2 minutes

interface UploadResult {
  id: string;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  blobUrl?: string;
  smallUrl?: string;
  mediumUrl?: string;
  largeUrl?: string;
  errorMessage?: string;
}

interface AvatarUploaderProps {
  onUploaded?: (result: UploadResult) => void;
  onStatusChange?: (result: UploadResult) => void;
  className?: string;
  initialUrl?: string;
}

export default function AvatarUploader({
  onUploaded,
  onStatusChange,
  className = '',
  initialUrl,
}: AvatarUploaderProps) {
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [preview, setPreview] = useState<string | null>(initialUrl || null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file) return;

    // Validate file
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      setError('Please select a valid image file (JPEG, PNG, or WebP)');
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      setError('File size must be less than 4MB');
      return;
    }

    setError(null);
    setUploading(true);

    // Show preview immediately
    const previewUrl = URL.createObjectURL(file);
    setPreview(previewUrl);

    try {
      // Upload to our API
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/images/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const result = (await response.json()) as UploadResult;
      setUploadResult(result);
      onUploaded?.(result);

      // Poll for status updates if processing
      if (result.status === 'processing') {
        startStatusPolling(result.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setPreview(initialUrl || null);
    } finally {
      setUploading(false);
    }
  }, [onUploaded, initialUrl]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const startStatusPolling = useCallback((photoId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/images/status/${photoId}`);
        if (!response.ok) return;

        const result = (await response.json()) as UploadResult;
        setUploadResult(result);
        onStatusChange?.(result);

        if (result.status === 'completed' || result.status === 'failed') {
          clearInterval(pollInterval);
          
          if (result.status === 'completed' && result.mediumUrl) {
            setPreview(result.mediumUrl);
          } else if (result.status === 'failed') {
            setError(result.errorMessage || 'Processing failed');
            setPreview(initialUrl || null);
          }
        }
      } catch (err) {
        console.error('Status polling error:', err);
      }
    }, POLLING_INTERVAL_MS);

    // Clean up after timeout
    setTimeout(() => clearInterval(pollInterval), POLLING_TIMEOUT_MS);
  }, [onStatusChange, initialUrl]);

  const [isDragActive, setIsDragActive] = useState(false);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we're leaving the main element
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragActive(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      // Clean up preview URL when component unmounts
      if (preview && preview.startsWith('blob:')) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  const getStatusMessage = () => {
    if (uploading) return 'Uploading...';
    if (uploadResult?.status === 'processing') return 'Processing image...';
    if (uploadResult?.status === 'failed') return 'Upload failed';
    if (error) return error;
    return null;
  };

  const isLoading = uploading || uploadResult?.status === 'processing';

  return (
    <div className={className}>
      <div className="space-y-4">
        {/* Avatar Preview */}
        <div className="flex items-center gap-4">
          <div className="relative">
            {preview ? (
              <Image
                src={preview}
                alt="Profile photo"
                width={80}
                height={80}
                className="rounded-full object-cover border border-gray-200 dark:border-gray-700"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-800 border border-gray-200 dark:border-gray-700" />
            )}
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          
          <div className="flex-1">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Profile Photo
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              JPG, PNG, or WebP. Max 4MB.
            </p>
            {getStatusMessage() && (
              <p className={`text-xs mt-1 ${
                error || uploadResult?.status === 'failed' 
                  ? 'text-red-600 dark:text-red-400' 
                  : 'text-blue-600 dark:text-blue-400'
              }`}>
                {getStatusMessage()}
              </p>
            )}
          </div>
        </div>

        {/* Drop Zone */}
        <div
          onDrop={(e) => {
            handleDrop(e);
            setIsDragActive(false);
          }}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onClick={() => {
            if (!uploading) {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/jpeg,image/jpg,image/png,image/webp';
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) handleFileSelect(file);
              };
              input.click();
            }
          }}
          className={`
            border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
            ${isDragActive 
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' 
              : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
            }
            ${uploading ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          <input
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            onChange={handleInputChange}
            disabled={uploading}
            className="sr-only"
            aria-label="Choose profile image"
          />
          <div className="space-y-2">
            <div className="text-2xl">📸</div>
            {isDragActive ? (
              <p className="text-sm text-blue-600 dark:text-blue-400">
                Drop your image here
              </p>
            ) : (
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  <span className="font-medium text-blue-600 dark:text-blue-400">
                    Click to upload
                  </span>{' '}
                  or drag and drop
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Your image will be automatically resized
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
