'use client';

import { AuthTextInput } from '@/features/auth';
import type { FormErrors } from './types';
import { WaitlistSpotifySearch } from './WaitlistSpotifySearch';

interface WaitlistAdditionalInfoStepProps {
  readonly spotifyUrl: string;
  readonly heardAbout: string;
  readonly fieldErrors: FormErrors;
  readonly isSubmitting: boolean;
  readonly isHydrating: boolean;
  readonly onSpotifyUrlChange: (value: string) => void;
  readonly onSpotifyArtistNameChange: (name: string | null) => void;
  readonly onHeardAboutChange: (value: string) => void;
  readonly setSpotifyUrlInputRef: (el: HTMLInputElement | null) => void;
}

export function WaitlistAdditionalInfoStep({
  spotifyUrl,
  heardAbout,
  fieldErrors,
  isSubmitting,
  isHydrating,
  onSpotifyUrlChange,
  onSpotifyArtistNameChange,
  onHeardAboutChange,
  setSpotifyUrlInputRef,
}: WaitlistAdditionalInfoStepProps) {
  return (
    <>
      <WaitlistSpotifySearch
        spotifyUrl={spotifyUrl}
        onUrlChange={onSpotifyUrlChange}
        onArtistNameChange={onSpotifyArtistNameChange}
        fieldErrors={fieldErrors}
        isSubmitting={isSubmitting}
        isHydrating={isHydrating}
        setInputRef={setSpotifyUrlInputRef}
      />

      <label htmlFor='heardAbout' className='sr-only'>
        How did you hear about us?
      </label>
      <AuthTextInput
        type='text'
        id='heardAbout'
        value={heardAbout}
        onChange={e => onHeardAboutChange(e.target.value)}
        maxLength={280}
        placeholder='How did you hear about us? (optional)'
        disabled={isSubmitting}
      />
    </>
  );
}
