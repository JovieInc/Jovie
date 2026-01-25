'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useProfileMutation } from '@/lib/queries';
import { Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';
import type { ProfileFormData, UseProfileFormReturn } from './types';

interface UseProfileFormOptions {
  artist: Artist;
  onUpdate: (artist: Artist) => void;
}

export function useProfileForm({
  artist,
  onUpdate,
}: UseProfileFormOptions): UseProfileFormReturn {
  const { has } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [formSubmitted, setFormSubmitted] = useState(false);
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});

  const hasRemoveBrandingFeature =
    has?.({ feature: 'remove_branding' }) ?? false;

  const [formData, setFormData] = useState<ProfileFormData>({
    name: artist.name || '',
    tagline: artist.tagline || '',
    image_url: artist.image_url || '',
    hide_branding: artist.settings?.hide_branding ?? false,
  });

  // TanStack Query mutation for profile updates
  const {
    mutateAsync: updateProfile,
    isPending: loading,
    isError,
    error: mutationError,
    isSuccess,
    reset: resetMutation,
  } = useProfileMutation({
    onSuccess: data => {
      const updatedArtist = convertDrizzleCreatorProfileToArtist(
        data.profile as Parameters<
          typeof convertDrizzleCreatorProfileToArtist
        >[0]
      );
      onUpdate(updatedArtist);

      const successMessage = document.getElementById('success-message');
      if (successMessage) {
        successMessage.textContent = 'Profile updated successfully!';
      }
    },
    // Let the hook handle error toasts
    silent: false,
  });

  // Auto-clear success state after 3 seconds
  useEffect(() => {
    if (isSuccess) {
      const timer = setTimeout(() => {
        resetMutation();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isSuccess, resetMutation]);

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = 'Artist name is required';
    } else if (formData.name.length > 50) {
      errors.name = 'Artist name must be less than 50 characters';
    }

    if (formData.tagline.length > 160) {
      errors.tagline = 'Tagline must be less than 160 characters';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitted(true);

    if (!validateForm()) {
      if (validationErrors.name && nameInputRef.current) {
        nameInputRef.current.focus();
      }
      return;
    }

    const settingsUpdates = hasRemoveBrandingFeature
      ? { hide_branding: formData.hide_branding }
      : undefined;

    await updateProfile({
      updates: {
        displayName: formData.name,
        bio: formData.tagline,
        avatarUrl: formData.image_url || undefined,
        ...(settingsUpdates ? { settings: settingsUpdates } : {}),
      },
    });
  };

  // Derive error message from mutation state
  const error = isError
    ? (mutationError?.message ?? 'Failed to update profile')
    : undefined;

  const formErrors = useMemo(() => {
    const errors: Record<string, string> = {};

    Object.entries(validationErrors).forEach(([key, value]) => {
      errors[key] = value;
    });

    if (error) {
      errors.form = error;
    }

    return errors;
  }, [validationErrors, error]);

  return {
    formRef,
    nameInputRef,
    loading,
    error,
    success: isSuccess,
    formSubmitted,
    validationErrors,
    hasRemoveBrandingFeature,
    formData,
    formErrors,
    setFormData,
    handleSubmit,
  };
}
