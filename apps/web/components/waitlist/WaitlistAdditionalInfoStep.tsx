'use client';

import { useEffect, useRef } from 'react';
import { Input } from '@/components/atoms/Input';
import type { FormErrors } from './types';

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
  const spotifyUrlInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isHydrating) return;
    spotifyUrlInputRef.current?.focus();
  }, [isHydrating]);

  return (
    <>
      <label htmlFor='spotifyUrl' className='sr-only'>
        Spotify link
      </label>
      <Input
        type='url'
        id='spotifyUrl'
        value={spotifyUrl}
        onChange={e => onSpotifyUrlChange(e.target.value)}
        ref={el => {
          spotifyUrlInputRef.current = el;
          setSpotifyUrlInputRef(el);
        }}
        maxLength={2048}
        aria-invalid={Boolean(fieldErrors.spotifyUrl)}
        aria-describedby={
          fieldErrors.spotifyUrl ? 'waitlist-spotify-url-error' : undefined
        }
        placeholder='open.spotify.com/artist/... (optional)'
        disabled={isSubmitting}
      />
      {fieldErrors.spotifyUrl && (
        <p
          id='waitlist-spotify-url-error'
          role='alert'
          className='text-sm text-red-400'
        >
          {fieldErrors.spotifyUrl[0]}
        </p>
      )}

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
