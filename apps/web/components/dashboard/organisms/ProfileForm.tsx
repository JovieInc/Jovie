'use client';

import { useAuth } from '@clerk/nextjs';
import { Button } from '@jovie/ui';
import { useMemo, useRef, useState } from 'react';
import { Input } from '@/components/atoms/Input';
import { FormField } from '@/components/molecules/FormField';
import { ErrorSummary } from '@/components/organisms/ErrorSummary';
import { useOptimisticMutation } from '@/lib/hooks/useOptimisticMutation';
// flags import removed - pre-launch
import { Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';

interface ProfileFormProps {
  artist: Artist;
  onUpdate: (artist: Artist) => void;
}

export function ProfileForm({ artist, onUpdate }: ProfileFormProps) {
  const { has } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [success, setSuccess] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});

  // Check if user has the remove_branding feature
  const hasRemoveBrandingFeature =
    has?.({ feature: 'remove_branding' }) ?? false;

  const [formData, setFormData] = useState({
    name: artist.name || '',
    tagline: artist.tagline || '',
    image_url: artist.image_url || '',
    hide_branding: artist.settings?.hide_branding ?? false,
  });

  // Validate form data
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
    return errors; // Return errors object for immediate use
  };

  // Optimistic mutation for profile updates
  const { mutate: updateProfile, isLoading, error } = useOptimisticMutation({
    mutationFn: async (updates: typeof formData, signal) => {
      const settingsUpdates = hasRemoveBrandingFeature
        ? { hide_branding: updates.hide_branding }
        : undefined;

      const res = await fetch('/api/dashboard/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: {
            displayName: updates.name,
            bio: updates.tagline,
            avatarUrl: updates.image_url || null,
            ...(settingsUpdates ? { settings: settingsUpdates } : {}),
          },
        }),
        signal,
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(err?.error ?? 'Failed to update profile');
      }

      return res.json();
    },
    onOptimisticUpdate: updates => {
      // Update parent immediately with optimistic artist object
      const optimisticArtist: Artist = {
        ...artist,
        name: updates.name,
        tagline: updates.tagline,
        image_url: updates.image_url,
        settings: {
          ...artist.settings,
          hide_branding: updates.hide_branding,
        },
      };
      onUpdate(optimisticArtist);
    },
    onRollback: () => {
      // Revert parent to original artist state
      onUpdate(artist);
      // Revert form data to match server state
      setFormData({
        name: artist.name || '',
        tagline: artist.tagline || '',
        image_url: artist.image_url || '',
        hide_branding: artist.settings?.hide_branding ?? false,
      });
    },
    onSuccess: (data: { profile: unknown }) => {
      // Update parent with server-confirmed artist
      const updatedArtist = convertDrizzleCreatorProfileToArtist(
        data.profile as Parameters<typeof convertDrizzleCreatorProfileToArtist>[0]
      );
      onUpdate(updatedArtist);
      setSuccess(true);

      // Announce success to screen readers
      const successMessage = document.getElementById('success-message');
      if (successMessage) {
        successMessage.textContent = 'Profile updated successfully!';
      }

      setTimeout(() => setSuccess(false), 3000);
    },
    successMessage: 'Profile updated successfully!',
    errorMessage: 'Failed to update profile',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitted(true);

    // Client-side validation BEFORE optimistic update
    const errors = validateForm();
    const isValid = Object.keys(errors).length === 0;

    if (!isValid) {
      // Focus the first field with an error using the returned errors object
      if (errors.name && nameInputRef.current) {
        nameInputRef.current.focus();
      }
      return;
    }

    // Trigger optimistic mutation
    await updateProfile(formData);
  };

  // Collect all form errors for the error summary
  const formErrors = useMemo(() => {
    const errors: Record<string, string> = {};

    // Include validation errors
    Object.entries(validationErrors).forEach(([key, value]) => {
      errors[key] = value;
    });

    // Include API error if present
    if (error) {
      errors.form = error;
    }

    return errors;
  }, [validationErrors, error]);

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className='space-y-4'
      noValidate
      data-testid='profile-form'
    >
      {/* Screen reader announcements */}
      <div
        className='sr-only'
        aria-live='assertive'
        aria-atomic='true'
        id='success-message'
      ></div>

      {/* Error summary for screen readers */}
      <ErrorSummary
        errors={formErrors}
        onFocusField={fieldName => {
          if (fieldName === 'name' && nameInputRef.current) {
            nameInputRef.current.focus();
          }
        }}
      />

      {/* Avatar uploader (disabled by default) */}
      <FormField
        label='Artist Name'
        error={formSubmitted ? validationErrors.name : undefined}
        helpText='Your name as it will appear on your profile'
        id='artist-name'
        required
      >
        <Input
          ref={nameInputRef}
          type='text'
          value={formData.name}
          onChange={e => setFormData({ ...formData, name: e.target.value })}
          placeholder='Your Artist Name'
          required
          autoCapitalize='words'
          autoCorrect='on'
          autoComplete='name'
          validationState={
            formSubmitted && validationErrors.name ? 'invalid' : null
          }
        />
      </FormField>

      <FormField
        label='Tagline'
        error={formSubmitted ? validationErrors.tagline : undefined}
        helpText='A brief description that appears under your name (max 160 characters)'
        id='artist-tagline'
      >
        <Input
          type='text'
          value={formData.tagline}
          onChange={e => setFormData({ ...formData, tagline: e.target.value })}
          placeholder='Share your story, music journey, or what inspires you...'
          autoCapitalize='sentences'
          autoCorrect='on'
          autoComplete='off'
          validationState={
            formSubmitted && validationErrors.tagline ? 'invalid' : null
          }
        />
      </FormField>

      {/* Branding Toggle - only show if user has the feature */}
      {hasRemoveBrandingFeature && (
        <FormField
          label='Branding'
          helpText='Control whether Jovie branding appears on your profile'
          id='branding-toggle'
        >
          <div className='flex items-center justify-between'>
            <div className='flex flex-col'>
              <span className='text-sm font-medium text-primary-token'>
                Show Jovie branding
              </span>
              <span className='text-xs text-secondary-token'>
                Display Jovie branding on your profile
              </span>
            </div>
            <button
              type='button'
              onClick={() =>
                setFormData({
                  ...formData,
                  hide_branding: !formData.hide_branding,
                })
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base ${
                formData.hide_branding ? 'bg-surface-3' : 'bg-accent'
              }`}
              disabled={loading}
              aria-pressed={!formData.hide_branding}
              aria-label={
                formData.hide_branding
                  ? 'Enable Jovie branding'
                  : 'Disable Jovie branding'
              }
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-surface-1 transition-transform ${
                  formData.hide_branding ? 'translate-x-1' : 'translate-x-6'
                }`}
                aria-hidden='true'
              />
            </button>
          </div>
        </FormField>
      )}

      <Button
        type='submit'
        disabled={isLoading}
        variant='primary'
        className='w-full'
        aria-busy={isLoading}
      >
        {isLoading ? (
          <div className='flex items-center justify-center space-x-2'>
            <span
              className='animate-spin motion-reduce:animate-none h-4 w-4 border-2 border-white border-t-transparent rounded-full'
              aria-hidden='true'
            ></span>
            <span>Updating...</span>
          </div>
        ) : (
          'Update Profile'
        )}
      </Button>

      {success && (
        // biome-ignore lint/a11y/useSemanticElements: status role needed for accessible success message announcement
        <div
          className='bg-green-500/10 border border-green-500/20 rounded-lg p-3'
          role='status'
          aria-live='polite'
        >
          <p className='text-sm text-green-600 dark:text-green-400'>
            Profile updated successfully!
          </p>
        </div>
      )}
    </form>
  );
}
