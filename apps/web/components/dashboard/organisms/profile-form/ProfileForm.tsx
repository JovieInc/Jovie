'use client';

import { Button, Input } from '@jovie/ui';
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
        disabled={loading}
        variant='primary'
        className='w-full'
        aria-busy={loading}
      >
        {loading ? (
          <div className='flex items-center justify-center space-x-2'>
            <span
              className='animate-spin motion-reduce:animate-none h-4 w-4 border-2 border-current border-t-transparent rounded-full'
              aria-hidden='true'
            ></span>
            <span>Updating...</span>
          </div>
        ) : (
          'Update Profile'
        )}
      </Button>

      {success && (
        <output
          className='bg-green-500/10 border border-green-500/20 rounded-lg p-3 block'
          aria-live='polite'
        >
          <p className='text-sm text-success'>Profile updated successfully!</p>
        </output>
      )}
    </form>
  );
}
