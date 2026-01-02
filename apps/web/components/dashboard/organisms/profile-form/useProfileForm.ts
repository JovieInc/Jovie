'use client';

import { useAuth } from '@clerk/nextjs';
import { useMemo, useRef, useState } from 'react';
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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState(false);
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

    setLoading(true);
    setError(undefined);
    setSuccess(false);

    try {
      const settingsUpdates = hasRemoveBrandingFeature
        ? { hide_branding: formData.hide_branding }
        : undefined;

      const res = await fetch('/api/dashboard/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: {
            displayName: formData.name,
            bio: formData.tagline,
            avatarUrl: formData.image_url || null,
            ...(settingsUpdates ? { settings: settingsUpdates } : {}),
          },
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(err?.error ?? 'Failed to update profile');
      }
      const json: { profile: unknown } = await res.json();
      const updatedArtist = convertDrizzleCreatorProfileToArtist(
        json.profile as Parameters<
          typeof convertDrizzleCreatorProfileToArtist
        >[0]
      );
      onUpdate(updatedArtist);
      setSuccess(true);

      const successMessage = document.getElementById('success-message');
      if (successMessage) {
        successMessage.textContent = 'Profile updated successfully!';
      }

      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error('Error:', error);
      setError('Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

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
    success,
    formSubmitted,
    validationErrors,
    hasRemoveBrandingFeature,
    formData,
    formErrors,
    setFormData,
    handleSubmit,
  };
}
