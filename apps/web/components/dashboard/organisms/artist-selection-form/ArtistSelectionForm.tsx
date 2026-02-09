'use client';

import { Button } from '@jovie/ui';
import { CheckCircle2, X } from 'lucide-react';
import Image from 'next/image';
import { Combobox } from '@/components/organisms/Combobox';
import { Container } from '@/components/site/Container';
import { ThemeToggle } from '@/components/site/theme-toggle';
import { useArtistSelectionForm } from './useArtistSelectionForm';

export function ArtistSelectionForm() {
  const {
    selectedArtist,
    pendingClaim,
    state,
    searchError,
    isLoading,
    options,
    handleArtistSelect,
    handleInputChange,
    handleSubmit,
    handleSkip,
    retryOperation,
  } = useArtistSelectionForm();

  return (
    <div className='min-h-screen bg-base transition-colors'>
      {/* Subtle grid background pattern */}
      <div className='absolute inset-0 grid-bg dark:grid-bg-dark' />

      {/* Gradient orbs - more subtle like Linear */}
      <div className='absolute top-0 left-1/4 w-96 h-96 bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-full blur-3xl' />
      <div className='absolute bottom-0 right-1/4 w-96 h-96 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-full blur-3xl' />

      {/* Theme Toggle */}
      <div className='absolute top-4 right-4 z-20'>
        <ThemeToggle />
      </div>

      <Container className='relative z-10'>
        <div className='flex min-h-screen items-center justify-center py-12'>
          <div className='w-full max-w-md'>
            {/* Header */}
            <div className='text-center mb-8'>
              <h1 className='text-3xl font-semibold text-primary-token mb-2 transition-colors'>
                Select Your Artist
              </h1>
              <p className='text-secondary-token text-lg transition-colors'>
                {pendingClaim
                  ? `We found "${pendingClaim.artistName}" in your Spotify. Is this you?`
                  : 'Search for your artist profile on Spotify to get started.'}
              </p>
            </div>

            {/* Error display */}
            {state.error && (
              <div className='bg-surface-2 border border-subtle rounded-lg p-4 mb-6'>
                <div className='flex items-center justify-between'>
                  <p className='text-sm text-destructive'>{state.error}</p>
                  <Button
                    onClick={retryOperation}
                    variant='secondary'
                    size='sm'
                    disabled={state.retryCount >= 3}
                  >
                    {state.retryCount >= 3 ? 'Max retries' : 'Retry'}
                  </Button>
                </div>
              </div>
            )}

            {/* Form Card */}
            <div className='bg-surface-1 backdrop-blur-sm border border-subtle rounded-xl p-6 shadow-xl transition-colors'>
              <form onSubmit={handleSubmit} className='space-y-6'>
                <div>
                  <Combobox
                    options={options}
                    value={
                      selectedArtist
                        ? {
                            id: selectedArtist.id,
                            name: selectedArtist.name,
                            imageUrl: selectedArtist.imageUrl,
                          }
                        : null
                    }
                    onChange={handleArtistSelect}
                    onInputChange={handleInputChange}
                    placeholder='Search for your artist on Spotify...'
                    label='Artist Profile'
                    isLoading={isLoading}
                    error={searchError}
                    showCta={false}
                    className='w-full'
                  />
                </div>

                {selectedArtist && (
                  <div className='flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 p-3'>
                    {selectedArtist.imageUrl ? (
                      <Image
                        src={selectedArtist.imageUrl}
                        alt=''
                        width={48}
                        height={48}
                        className='h-12 w-12 rounded-full object-cover flex-shrink-0'
                        aria-hidden='true'
                      />
                    ) : (
                      <div
                        className='h-12 w-12 rounded-full bg-surface-2 flex-shrink-0'
                        aria-hidden='true'
                      />
                    )}
                    <div className='flex-1 min-w-0'>
                      <p className='text-sm font-medium text-primary-token truncate'>
                        {selectedArtist.name}
                      </p>
                      <p className='text-xs text-green-600 dark:text-green-400 flex items-center gap-1'>
                        <CheckCircle2
                          className='h-3.5 w-3.5'
                          aria-hidden='true'
                        />
                        Artist selected
                      </p>
                    </div>
                    <button
                      type='button'
                      onClick={() => handleArtistSelect(null)}
                      className='flex-shrink-0 rounded-md p-1 text-secondary-token hover:text-primary-token hover:bg-surface-2 transition-colors'
                      aria-label={`Remove ${selectedArtist.name}`}
                    >
                      <X className='h-4 w-4' />
                    </button>
                  </div>
                )}

                <div className='flex flex-col space-y-3'>
                  <Button
                    type='submit'
                    disabled={!selectedArtist || state.loading}
                    variant='primary'
                    className='w-full'
                  >
                    {state.loading ? 'Saving...' : 'Continue with This Artist'}
                  </Button>

                  <Button
                    type='button'
                    onClick={handleSkip}
                    variant='secondary'
                    className='w-full'
                  >
                    Skip for Now
                  </Button>
                </div>
              </form>
            </div>

            {/* Footer */}
            <div className='text-center mt-8'>
              <p className='text-sm text-secondary-token transition-colors'>
                You can always update your artist profile later
              </p>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
