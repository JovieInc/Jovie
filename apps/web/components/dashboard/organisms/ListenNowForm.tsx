'use client';

import { Button, Input } from '@jovie/ui';
import { useEffect, useRef, useState } from 'react';
import { FormField } from '@/components/molecules/FormField';
import { useProfileMutation } from '@/lib/queries';
import { normalizeUrl } from '@/lib/utils/platform-detection';
import {
  Artist,
  CreatorProfile,
  convertCreatorProfileToArtist,
} from '@/types/db';

interface ListenNowFormProps {
  readonly artist: Artist;
  readonly onUpdate: (artist: Artist) => void;
}

export function ListenNowForm({ artist, onUpdate }: ListenNowFormProps) {
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    spotify_url: artist.spotify_url || '',
    apple_music_url: artist.apple_music_url || '',
    youtube_url: artist.youtube_url || '',
  });
  // Debounce timers per field
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const { mutate: updateProfile, isPending: loading } = useProfileMutation({
    silent: true, // We handle our own success/error UI
    onSuccess: data => {
      const updatedArtist = convertCreatorProfileToArtist(
        data.profile as unknown as CreatorProfile
      );
      onUpdate(updatedArtist);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    },
    onError: err => {
      console.error('Error:', err);
      setError('Failed to update music links');
    },
  });

  // Cleanup all timers on unmount
  useEffect(() => {
    const currentTimers = timers.current;
    return () => {
      Object.values(currentTimers).forEach(clearTimeout);
    };
  }, []);

  const scheduleNormalize = (key: keyof typeof formData, value: string) => {
    // clear previous timer
    if (timers.current[key]) {
      clearTimeout(timers.current[key]);
    }
    timers.current[key] = setTimeout(() => {
      try {
        const norm = normalizeUrl(value.trim());
        setFormData(prev =>
          prev[key] === norm ? prev : { ...prev, [key]: norm }
        );
      } catch {
        // ignore
      }
    }, 500);
  };

  const handleBlur = (key: keyof typeof formData) => {
    setFormData(prev => {
      const norm = normalizeUrl((prev[key] || '').trim());
      return prev[key] === norm ? prev : { ...prev, [key]: norm };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setSuccess(false);

    updateProfile({
      profileId: artist.id,
      updates: {
        spotify_url: formData.spotify_url || null,
        apple_music_url: formData.apple_music_url || null,
        youtube_url: formData.youtube_url || null,
      },
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className='space-y-4'
      data-testid='listen-now-form'
    >
      <FormField label='Spotify URL' error={error}>
        <Input
          type='url'
          value={formData.spotify_url}
          onChange={e => {
            const v = e.target.value;
            setFormData(prev => ({ ...prev, spotify_url: v }));
            scheduleNormalize('spotify_url', v);
          }}
          onBlur={() => handleBlur('spotify_url')}
          placeholder='https://open.spotify.com/artist/...'
          inputMode='url'
          autoCapitalize='none'
          autoCorrect='off'
          autoComplete='off'
        />
      </FormField>

      <FormField label='Apple Music URL'>
        <Input
          type='url'
          value={formData.apple_music_url}
          onChange={e => {
            const v = e.target.value;
            setFormData(prev => ({ ...prev, apple_music_url: v }));
            scheduleNormalize('apple_music_url', v);
          }}
          onBlur={() => handleBlur('apple_music_url')}
          placeholder='https://music.apple.com/...'
          inputMode='url'
          autoCapitalize='none'
          autoCorrect='off'
          autoComplete='off'
        />
      </FormField>

      <FormField label='YouTube URL'>
        <Input
          type='url'
          value={formData.youtube_url}
          onChange={e => {
            const v = e.target.value;
            setFormData(prev => ({ ...prev, youtube_url: v }));
            scheduleNormalize('youtube_url', v);
          }}
          onBlur={() => handleBlur('youtube_url')}
          placeholder='https://youtube.com/...'
          inputMode='url'
          autoCapitalize='none'
          autoCorrect='off'
          autoComplete='off'
        />
      </FormField>

      <Button
        type='submit'
        disabled={loading}
        variant='primary'
        className='w-full'
      >
        {loading ? 'Updating...' : 'Update Links'}
      </Button>

      {success && (
        <div className='bg-green-500/10 border border-green-500/20 rounded-lg p-3'>
          <p className='text-sm text-green-600 dark:text-green-400'>
            Links updated successfully!
          </p>
        </div>
      )}
    </form>
  );
}
