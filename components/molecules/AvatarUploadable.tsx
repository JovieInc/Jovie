'use client';

import { Check, Upload, X } from 'lucide-react';
import React, { useCallback, useRef, useState } from 'react';
import { Avatar, type AvatarProps } from '@/components/atoms/Avatar';
import { cn } from '@/lib/utils';
import { track } from '@/lib/analytics';

export interface AvatarUploadableProps extends Omit<AvatarProps, 'src'> {
  /** Current avatar image URL */
  src?: string | null;
  /** Whether uploading is enabled (controlled by feature flag) */
  uploadable?: boolean;
  /** Upload callback that returns a promise with the new image URL */
  onUpload?: (file: File) => Promise<string>;
  /** Progress percentage (0-100) for upload progress */
  progress?: number;
  /** Error callback */
  onError?: (error: string) => void;
  /** Success callback with new image URL */
  onSuccess?: (imageUrl: string) => void;
  /** Maximum file size in bytes (default: 10MB) */
  maxFileSize?: number;
  /** Accepted file types */
  acceptedTypes?: string[];
  /** Whether to show hover overlay when uploadable */
  showHoverOverlay?: boolean;
}

// Progress ring SVG constants
const STROKE_WIDTH = 3;
// const RING_SIZE = 100; // Percentage of avatar size (unused for now)
const RADIUS = 50 - STROKE_WIDTH / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// File validation
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic'];

/**
 * Validates a file for upload
 */
function validateFile(
  file: File,
  maxFileSize: number = DEFAULT_MAX_FILE_SIZE,
  acceptedTypes: string[] = DEFAULT_ACCEPTED_TYPES
): string | null {
  if (!acceptedTypes.includes(file.type)) {
    return `Invalid file type. Please select ${acceptedTypes.map(t => t.split('/')[1].toUpperCase()).join(', ')} files only.`;
  }
  
  if (file.size > maxFileSize) {
    const sizeMB = Math.round(maxFileSize / (1024 * 1024));
    return `File too large. Please select a file smaller than ${sizeMB}MB.`;
  }
  
  return null;
}

/**
 * Progress Ring Component for radial upload progress
 */
function ProgressRing({ 
  progress, 
  size, 
  status 
}: { 
  progress: number; 
  size: number;
  status: 'uploading' | 'success' | 'error' | 'idle';
}) {
  const strokeDasharray = `${(progress / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`;
  const ringColor = status === 'error' ? 'stroke-red-500' : status === 'success' ? 'stroke-green-500' : 'stroke-blue-500';
  
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        className="transform -rotate-90"
      >
        {/* Background ring */}
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE_WIDTH}
          className="text-gray-300 dark:text-gray-600"
        />
        {/* Progress ring */}
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE_WIDTH}
          strokeDasharray={strokeDasharray}
          strokeLinecap="round"
          className={cn(
            'transition-all duration-300 ease-out',
            ringColor
          )}
        />
      </svg>
      
      {/* Status icons */}
      <div className="absolute inset-0 flex items-center justify-center">
        {status === 'success' && (
          <div className="bg-green-500 rounded-full p-1 text-white">
            <Check size={size * 0.15} />
          </div>
        )}
        {status === 'error' && (
          <div className="bg-red-500 rounded-full p-1 text-white">
            <X size={size * 0.15} />
          </div>
        )}
        {status === 'uploading' && (
          <div className="bg-blue-500 rounded-full p-1 text-white animate-pulse">
            <Upload size={size * 0.15} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Uploadable Avatar component with radial progress and drag/drop
 * 
 * Features:
 * - Radial progress arc around avatar during upload
 * - Drag & drop file upload
 * - Click to upload with file picker
 * - File validation with user-friendly errors
 * - Success/error states with visual feedback
 * - Keyboard accessibility
 * - Analytics tracking
 * - Feature flag controlled
 */
export const AvatarUploadable = React.memo(function AvatarUploadable({
  src,
  uploadable = false,
  onUpload,
  progress = 0,
  onError,
  onSuccess,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
  showHoverOverlay = true,
  className,
  ...avatarProps
}: AvatarUploadableProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Get size for progress ring
  const avatarSize = avatarProps.size || 'md';
  const sizeMap = { xs: 24, sm: 32, md: 48, lg: 64, xl: 80, '2xl': 96 };
  const numericSize = sizeMap[avatarSize];
  
  /**
   * Handle file upload
   */
  const handleFileUpload = useCallback(async (file: File) => {
    if (!onUpload) return;
    
    // Validate file
    const validationError = validateFile(file, maxFileSize, acceptedTypes);
    if (validationError) {
      onError?.(validationError);
      setUploadStatus('error');
      track('avatar_upload_error', { error: 'validation_failed', message: validationError });
      return;
    }
    
    setIsUploading(true);
    setUploadStatus('uploading');
    track('avatar_upload_start', { file_size: file.size, file_type: file.type });
    
    try {
      const imageUrl = await onUpload(file);
      setUploadStatus('success');
      onSuccess?.(imageUrl);
      track('avatar_upload_success', { file_size: file.size });
      
      // Auto-reset success state after animation
      setTimeout(() => {
        setUploadStatus('idle');
      }, 2000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setUploadStatus('error');
      onError?.(errorMessage);
      track('avatar_upload_error', { error: 'upload_failed', message: errorMessage });
      
      // Auto-reset error state
      setTimeout(() => {
        setUploadStatus('idle');
      }, 3000);
    } finally {
      setIsUploading(false);
    }
  }, [onUpload, maxFileSize, acceptedTypes, onError, onSuccess]);
  
  /**
   * Handle file selection from input
   */
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  }, [handleFileUpload]);
  
  /**
   * Handle drag events
   */
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (uploadable && !isUploading) {
      setIsDragOver(true);
    }
  }, [uploadable, isUploading]);
  
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only reset if leaving the entire container
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);
  
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);
  
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    if (!uploadable || isUploading) return;
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  }, [uploadable, isUploading, handleFileUpload]);
  
  /**
   * Handle click to upload
   */
  const handleClick = useCallback(() => {
    if (uploadable && !isUploading) {
      fileInputRef.current?.click();
    }
  }, [uploadable, isUploading]);
  
  /**
   * Handle keyboard interaction
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (uploadable && !isUploading && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  }, [uploadable, isUploading]);
  
  // Report progress to analytics
  React.useEffect(() => {
    if (isUploading && progress > 0) {
      track('avatar_upload_progress', { progress });
    }
  }, [isUploading, progress]);
  
  const isInteractive = uploadable && !isUploading;
  const showProgress = isUploading || uploadStatus === 'success' || uploadStatus === 'error';
  const currentProgress = uploadStatus === 'success' ? 100 : uploadStatus === 'error' ? 100 : progress;
  
  return (
    <div
      ref={containerRef}
      className={cn(
        'relative group',
        isInteractive && 'cursor-pointer',
        className
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={isInteractive ? 0 : undefined}
      role={isInteractive ? 'button' : undefined}
      aria-label={isInteractive ? 'Upload profile photo' : undefined}
    >
      {/* Base Avatar */}
      <Avatar
        src={src}
        className={cn(
          'transition-all duration-200',
          isInteractive && 'group-hover:brightness-90 group-focus-visible:ring-2 group-focus-visible:ring-blue-500 group-focus-visible:ring-offset-2',
          isDragOver && 'brightness-75 scale-105',
          isUploading && 'brightness-90'
        )}
        {...avatarProps}
      />
      
      {/* Hover overlay for upload affordance */}
      {isInteractive && showHoverOverlay && (
        <div className={cn(
          'absolute inset-0 flex items-center justify-center',
          'bg-black/40 text-white rounded-full',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-200',
          avatarProps.rounded !== 'full' && 'rounded-lg'
        )}>
          <Upload size={numericSize * 0.3} />
        </div>
      )}
      
      {/* Drag overlay */}
      {isDragOver && (
        <div className={cn(
          'absolute inset-0 flex items-center justify-center',
          'bg-blue-500/80 text-white rounded-full border-2 border-blue-300 border-dashed',
          'animate-pulse',
          avatarProps.rounded !== 'full' && 'rounded-lg'
        )}>
          <Upload size={numericSize * 0.4} />
        </div>
      )}
      
      {/* Progress ring */}
      {showProgress && (
        <ProgressRing 
          progress={currentProgress} 
          size={numericSize} 
          status={uploadStatus}
        />
      )}
      
      {/* Hidden file input */}
      {uploadable && (
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedTypes.join(',')}
          onChange={handleFileSelect}
          className="sr-only"
          aria-label="Choose profile photo file"
        />
      )}
      
      {/* Progress announcer for screen readers */}
      {isUploading && (
        <div
          className="sr-only"
          aria-live="polite"
          aria-atomic="true"
        >
          Uploading profile photo: {Math.round(progress)}% complete
        </div>
      )}
      
      {/* Status announcer for screen readers */}
      {uploadStatus === 'success' && (
        <div className="sr-only" aria-live="polite">
          Profile photo uploaded successfully
        </div>
      )}
      
      {uploadStatus === 'error' && (
        <div className="sr-only" aria-live="assertive">
          Profile photo upload failed
        </div>
      )}
    </div>
  );
});

// Export named component (no default exports per architecture guidelines)
export { AvatarUploadable as default };