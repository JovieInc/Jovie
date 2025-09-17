'use client';

import * as React from 'react';
import { useCallback, useState } from 'react';
import { BasicInfoForm } from '@/components/molecules/BasicInfoForm';
import { ProfilePhotoSection } from '@/components/molecules/ProfilePhotoSection';
import type { Artist } from '@/types/db';

interface ProfileSettingsProps {
  artist: Artist;
  appDomain: string;
  onArtistUpdate?: (updatedArtist: Artist) => void;
  className?: string;
}

export function ProfileSettings({
  artist,
  appDomain,
  onArtistUpdate,
  className,
}: ProfileSettingsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: artist.handle || '',
    displayName: artist.name || '',
  });

  const handleAvatarUpdate = useCallback(
    async (imageUrl: string) => {
      const previousImage = artist.image_url;

      try {
        const response = await fetch('/api/dashboard/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            updates: {
              avatarUrl: imageUrl,
            },
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            (data as { error?: string }).error ||
              'Failed to update profile photo'
          );
        }

        const profile = (data as { profile?: { avatarUrl?: string } }).profile;

        if (onArtistUpdate) {
          onArtistUpdate({
            ...artist,
            image_url: profile?.avatarUrl ?? imageUrl,
          });
        }
      } catch (error) {
        if (onArtistUpdate) {
          onArtistUpdate({
            ...artist,
            image_url: previousImage,
          });
        }
        throw error; // Let the AvatarUpload component handle the error display
      }
    },
    [artist, onArtistUpdate]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoading(true);

      try {
        const response = await fetch('/api/dashboard/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            updates: {
              username: formData.username,
              displayName: formData.displayName,
            },
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to update profile');
        }

        const { profile } = await response.json();

        if (onArtistUpdate) {
          onArtistUpdate({
            ...artist,
            handle: profile.username,
            name: profile.displayName,
          });
        }
      } catch (error) {
        console.error('Failed to update profile:', error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [formData, artist, onArtistUpdate]
  );

  return (
    <div className={className}>
      <div className='space-y-6'>
        <ProfilePhotoSection
          currentAvatarUrl={artist.image_url}
          artistName={artist.name}
          onUploadSuccess={handleAvatarUpdate}
        />

        <BasicInfoForm
          username={formData.username}
          displayName={formData.displayName}
          appDomain={appDomain}
          isLoading={isLoading}
          onUsernameChange={value =>
            setFormData(prev => ({ ...prev, username: value }))
          }
          onDisplayNameChange={value =>
            setFormData(prev => ({ ...prev, displayName: value }))
          }
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
