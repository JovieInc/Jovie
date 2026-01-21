/**
 * Example Usage of Unified Avatar Components
 *
 * This file demonstrates how to integrate the new Avatar and AvatarUploadable
 * components into existing dashboard and profile pages.
 */

'use client';

import { useState } from 'react';
import { Avatar } from '@/components/atoms/Avatar';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  formatAcceptedImageTypes,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '@/lib/images/config';

// Example 1: Display-only avatar (for public profiles, featured creators, etc.)
export function PublicProfileExample() {
  return (
    <div className='flex items-center space-x-4'>
      <Avatar
        src='https://example.com/user-avatar.jpg'
        alt='User profile photo'
        name='John Doe'
        size='lg'
        rounded='full'
      />
      <div>
        <h3 className='text-lg font-semibold'>John Doe</h3>
        <p className='text-secondary-token'>Musician & Creator</p>
      </div>
    </div>
  );
}

// Example 2: Uploadable avatar (for dashboard settings, profile editing)
export function DashboardAvatarExample() {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    'https://example.com/current-avatar.jpg'
  );
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  // Mock upload function - replace with actual upload logic
  const handleUpload = async (file: File): Promise<string> => {
    setIsUploading(true);
    setUploadProgress(0);

    // Simulate upload progress
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + Math.random() * 15;
      });
    }, 100);

    try {
      // Replace with actual upload to Vercel Blob
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/images/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const { blobUrl } = await response.json();

      setUploadProgress(100);
      setAvatarUrl(blobUrl);

      return blobUrl;
    } finally {
      clearInterval(progressInterval);
      setIsUploading(false);
    }
  };

  return (
    <div className='space-y-6'>
      <h2 className='text-xl font-semibold'>Profile Settings</h2>

      <div className='flex items-start space-x-6'>
        {/* Feature flag controlled uploadable avatar */}
        <AvatarUploadable
          src={avatarUrl}
          alt='Your profile photo'
          name='Current User'
          size='xl'
          uploadable={true} // This would be controlled by feature flag in real usage
          onUpload={handleUpload}
          progress={uploadProgress}
          onSuccess={url => {
            console.log('Avatar uploaded successfully:', url);
            // Update user profile in database
          }}
          onError={error => {
            console.error('Avatar upload failed:', error);
            // Show error toast notification
          }}
          maxFileSize={AVATAR_MAX_FILE_SIZE_BYTES}
          acceptedTypes={SUPPORTED_IMAGE_MIME_TYPES}
        />

        <div className='flex-1 space-y-3'>
          <h3 className='text-lg font-medium'>Profile Photo</h3>
          <p className='text-sm text-secondary-token'>
            Upload a new profile photo. Drag and drop an image file or click to
            select.
          </p>
          <p className='text-xs text-tertiary-token'>
            Supported formats: {formatAcceptedImageTypes().join(', ')}. Maximum
            size: {Math.round(AVATAR_MAX_FILE_SIZE_BYTES / (1024 * 1024))}MB.
          </p>

          {isUploading && (
            <div className='text-sm text-accent-token'>
              Uploading... {Math.round(uploadProgress)}%
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Example 3: Featured creators grid (display-only)
export function FeaturedCreatorsExample() {
  const creators = [
    { id: 1, name: 'Artist One', avatar: 'https://example.com/artist1.jpg' },
    { id: 2, name: 'Artist Two', avatar: 'https://example.com/artist2.jpg' },
    { id: 3, name: 'Artist Three', avatar: null }, // Will show initials
  ];

  return (
    <div className='grid grid-cols-3 gap-4'>
      {creators.map(creator => (
        <div key={creator.id} className='text-center'>
          <Avatar
            src={creator.avatar}
            alt={`${creator.name}'s profile`}
            name={creator.name}
            size='lg'
            className='mx-auto mb-2'
          />
          <p className='text-sm font-medium'>{creator.name}</p>
        </div>
      ))}
    </div>
  );
}

// Example 4: Integration with feature flags
export function ConditionalAvatarExample({
  userOwnsProfile,
}: Readonly<{
  userOwnsProfile: boolean;
}>) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Determine if upload should be enabled
  const uploadEnabled = userOwnsProfile;

  if (uploadEnabled) {
    return (
      <AvatarUploadable
        src={avatarUrl}
        alt='Profile photo'
        name='User Name'
        size='lg'
        uploadable={true}
        onUpload={async () => {
          // Handle upload
          return 'new-avatar-url';
        }}
        onSuccess={url => setAvatarUrl(url)}
      />
    );
  }

  // Display-only mode for public view or when feature is disabled
  return (
    <Avatar src={avatarUrl} alt='Profile photo' name='User Name' size='lg' />
  );
}
