'use client';

import { Input } from '@/components/atoms/Input';
import type { FormErrors } from './types';
import { WaitlistSpotifySearch } from './WaitlistSpotifySearch';

interface WaitlistAdditionalInfoStepProps {
  spotifyUrl: string;
  heardAbout: string;
  fieldErrors: FormErrors;
  isSubmitting: boolean;
  isHydrating: boolean;
  onSpotifyUrlChange: (value: string) => void;
  onHeardAboutChange: (value: string) => void;
  setSpotifyUrlInputRef: (el: HTMLInputElement | null) => void;
}

export function WaitlistAdditionalInfoStep({
  spotifyUrl,
  heardAbout,
  fieldErrors,
  isSubmitting,
  isHydrating,
  onSpotifyUrlChange,
  onHeardAboutChange,
  setSpotifyUrlInputRef,
}: WaitlistAdditionalInfoStepProps) {
  return (
    <>
      <WaitlistSpotifySearch
        spotifyUrl={spotifyUrl}
        onUrlChange={onSpotifyUrlChange}
        fieldErrors={fieldErrors}
        isSubmitting={isSubmitting}
        isHydrating={isHydrating}
        setInputRef={setSpotifyUrlInputRef}
      />

      <label htmlFor='heardAbout' className='sr-only'>
        How did you hear about us?
      </label>
      <Input
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
