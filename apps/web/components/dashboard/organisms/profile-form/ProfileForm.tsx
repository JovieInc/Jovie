'use client';

import { Button, Input } from '@jovie/ui';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { FormField } from '@/components/molecules/FormField';
import { ErrorSummary } from '@/components/organisms/ErrorSummary';
import type { ProfileFormProps } from './types';
import { useProfileForm } from './useProfileForm';

export function ProfileForm({ artist, onUpdate }: ProfileFormProps) {
  const {
    formRef,
    nameInputRef,
    loading,
    success,
    formSubmitted,
    validationErrors,
    hasRemoveBrandingFeature,
    formData,
    formErrors,
    setFormData,
    handleSubmit,
  } = useProfileForm({ artist, onUpdate });

  return (
    <form
      ref={formRef as React.RefObject<HTMLFormElement>}
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
          ref={nameInputRef as React.RefObject<HTMLInputElement>}
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
          <ContentSurfaceCard className='flex items-center justify-between bg-(--linear-bg-surface-0) px-4 py-3.5'>
            <div className='flex flex-col'>
              <span className='text-[13px] font-[510] text-(--linear-text-primary)'>
                Show Jovie branding
              </span>
              <span className='text-[11px] text-(--linear-text-secondary)'>
                Display Jovie branding on your profile
              </span>
            </div>
            <button
              type='button'
              onClick={() =>
                setFormData({
                  ...formData,
                  hideBranding: !formData.hideBranding,
                })
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full border border-(--linear-border-subtle) p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus) ${
                formData.hideBranding
                  ? 'bg-(--linear-bg-surface-0)'
                  : 'bg-(--linear-border-focus)'
              }`}
              disabled={loading}
              aria-pressed={!formData.hideBranding}
              aria-label={
                formData.hideBranding
                  ? 'Enable Jovie branding'
                  : 'Disable Jovie branding'
              }
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-(--linear-bg-surface-1) transition-transform ${
                  formData.hideBranding ? 'translate-x-1' : 'translate-x-6'
                }`}
                aria-hidden='true'
              />
            </button>
          </ContentSurfaceCard>
        </FormField>
      )}

      <Button
        type='submit'
        disabled={loading}
        variant='primary'
        className='w-full'
        aria-busy={loading}
      >
        {loading ? (
          <div className='flex items-center justify-center space-x-2'>
            <LoadingSpinner size='sm' tone='inverse' label='Updating' />
            <span>Updating...</span>
          </div>
        ) : (
          'Update Profile'
        )}
      </Button>

      {success && (
        <ContentSurfaceCard
          className='block border-emerald-500/20 bg-emerald-500/5 p-3'
          aria-live='polite'
          as='output'
        >
          <p className='text-[13px] text-emerald-600 dark:text-emerald-400'>
            Profile updated successfully!
          </p>
        </ContentSurfaceCard>
      )}
    </form>
  );
}
