'use client';

import { Button } from '@jovie/ui';
import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { addManualDspMatch } from '@/app/app/(shell)/dashboard/presence/actions';
import {
  Dialog,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import {
  DspProviderIcon,
  PROVIDER_LABELS,
} from '@/features/dashboard/atoms/DspProviderIcon';
import type { DspProviderId } from '@/lib/dsp-enrichment/types';
import {
  DSP_PROVIDER_IDS,
  DSP_PROVIDER_PLACEHOLDERS,
} from '@/lib/dsp-provider-metadata';
import { cn } from '@/lib/utils';

const ALL_PROVIDERS: readonly DspProviderId[] = [...DSP_PROVIDER_IDS];

const PROVIDER_PLACEHOLDERS = {
  spotify: 'https://open.spotify.com/artist/...',
  apple_music: 'https://music.apple.com/artist/...',
  deezer: 'https://www.deezer.com/artist/...',
  youtube_music: 'https://music.youtube.com/channel/...',
  tidal: 'https://tidal.com/artist/...',
  soundcloud: 'https://soundcloud.com/...',
  amazon_music: 'https://music.amazon.com/artists/...',
  musicbrainz: 'https://musicbrainz.org/artist/...',
} as Record<DspProviderId, string>;

if (DSP_PROVIDER_PLACEHOLDERS.genius) {
  PROVIDER_PLACEHOLDERS.genius = DSP_PROVIDER_PLACEHOLDERS.genius;
}
if (DSP_PROVIDER_PLACEHOLDERS.discogs) {
  PROVIDER_PLACEHOLDERS.discogs = DSP_PROVIDER_PLACEHOLDERS.discogs;
}
if (DSP_PROVIDER_PLACEHOLDERS.allmusic) {
  PROVIDER_PLACEHOLDERS.allmusic = DSP_PROVIDER_PLACEHOLDERS.allmusic;
}

interface AddPlatformDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly existingProviderIds: DspProviderId[];
}

export function AddPlatformDialog({
  open,
  onClose,
  existingProviderIds,
}: AddPlatformDialogProps) {
  const [selectedProvider, setSelectedProvider] =
    useState<DspProviderId | null>(null);
  const [url, setUrl] = useState('');
  const [artistName, setArtistName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const nameId = useId();
  const urlId = useId();

  const availableProviders = ALL_PROVIDERS.filter(
    id => !existingProviderIds.includes(id)
  );

  function resetForm() {
    setSelectedProvider(null);
    setUrl('');
    setArtistName('');
    setError(null);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProvider || !url || !artistName) return;

    setError(null);
    startTransition(async () => {
      try {
        const result = await addManualDspMatch({
          providerId: selectedProvider,
          url,
          artistName,
        });

        if (result.success) {
          toast.success('Platform added');
          resetForm();
          onClose();
        } else {
          setError(result.error ?? 'Something went wrong');
        }
      } catch {
        setError('Something went wrong. Please try again.');
      }
    });
  }

  return (
    <Dialog open={open} onClose={handleClose} size='sm'>
      <DialogTitle>Add Platform</DialogTitle>
      <DialogDescription className='sr-only'>
        Link your artist profile on a streaming platform
      </DialogDescription>

      <form noValidate onSubmit={handleSubmit} className='mt-5 space-y-4'>
        {/* Provider picker */}
        {availableProviders.length === 0 ? (
          <p className='text-app text-tertiary-token text-center py-4'>
            All platforms are already linked
          </p>
        ) : (
          <div className='grid grid-cols-3 gap-2'>
            {availableProviders.map(id => (
              <button
                key={id}
                type='button'
                aria-pressed={selectedProvider === id}
                onClick={() => {
                  setSelectedProvider(id);
                  setError(null);
                }}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border border-subtle p-2 text-2xs text-secondary-token hover:bg-surface-1 transition-colors',
                  selectedProvider === id && 'border-accent bg-surface-1'
                )}
              >
                <DspProviderIcon provider={id} size='md' />
                <span className='w-full text-center'>
                  {PROVIDER_LABELS[id]}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Form fields (shown when provider selected) */}
        {selectedProvider && (
          <>
            <div>
              <label htmlFor={nameId} className='sr-only'>
                Artist name
              </label>
              <input
                id={nameId}
                type='text'
                value={artistName}
                onChange={e => setArtistName(e.target.value)}
                placeholder='Artist name on this platform'
                className='w-full rounded-lg border border-subtle bg-surface-0 px-3 py-2 text-app text-primary-token placeholder:text-quaternary-token focus:outline-none focus:ring-1 focus:ring-accent/50'
              />
            </div>
            <div>
              <label htmlFor={urlId} className='sr-only'>
                Profile URL
              </label>
              <input
                id={urlId}
                type='url'
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder={PROVIDER_PLACEHOLDERS[selectedProvider]}
                className='w-full rounded-lg border border-subtle bg-surface-0 px-3 py-2 text-app text-primary-token placeholder:text-quaternary-token focus:outline-none focus:ring-1 focus:ring-accent/50'
              />
            </div>
            {error && (
              <p className='text-xs text-red-500' role='alert'>
                {error}
              </p>
            )}
            <Button
              type='submit'
              variant='primary'
              size='sm'
              disabled={!url || !artistName || isPending}
            >
              {isPending ? 'Adding...' : 'Add Platform'}
            </Button>
          </>
        )}
      </form>
    </Dialog>
  );
}
