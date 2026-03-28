'use client';

import { Button } from '@jovie/ui';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { addManualDspMatch } from '@/app/app/(shell)/dashboard/presence/actions';
import { Dialog, DialogTitle } from '@/components/organisms/Dialog';
import {
  DspProviderIcon,
  PROVIDER_LABELS,
} from '@/features/dashboard/atoms/DspProviderIcon';
import type { DspProviderId } from '@/lib/dsp-enrichment/types';
import { cn } from '@/lib/utils';

const ALL_PROVIDERS: DspProviderId[] = [
  'spotify',
  'apple_music',
  'deezer',
  'youtube_music',
  'tidal',
  'soundcloud',
  'amazon_music',
  'musicbrainz',
];

const PROVIDER_PLACEHOLDERS: Record<DspProviderId, string> = {
  spotify: 'https://open.spotify.com/artist/...',
  apple_music: 'https://music.apple.com/artist/...',
  deezer: 'https://www.deezer.com/artist/...',
  youtube_music: 'https://music.youtube.com/channel/...',
  tidal: 'https://tidal.com/artist/...',
  soundcloud: 'https://soundcloud.com/...',
  amazon_music: 'https://music.amazon.com/artists/...',
  musicbrainz: 'https://musicbrainz.org/artist/...',
};

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

  function handleSubmit() {
    if (!selectedProvider || !url || !artistName) return;

    setError(null);
    startTransition(async () => {
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
    });
  }

  return (
    <Dialog open={open} onClose={handleClose} size='sm'>
      <DialogTitle>Add Platform</DialogTitle>

      <div className='mt-5 space-y-4'>
        {/* Provider picker */}
        {availableProviders.length === 0 ? (
          <p className='text-[13px] text-tertiary-token text-center py-4'>
            All platforms are already linked
          </p>
        ) : (
          <div className='grid grid-cols-4 gap-2'>
            {availableProviders.map(id => (
              <button
                key={id}
                type='button'
                onClick={() => {
                  setSelectedProvider(id);
                  setError(null);
                }}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border border-subtle p-2 text-[11px] text-secondary-token hover:bg-surface-1 transition-colors',
                  selectedProvider === id && 'border-[#7170ff] bg-surface-1'
                )}
              >
                <DspProviderIcon provider={id} size='md' />
                <span className='truncate w-full text-center'>
                  {PROVIDER_LABELS[id]}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Form fields (shown when provider selected) */}
        {selectedProvider && (
          <>
            <input
              type='text'
              value={artistName}
              onChange={e => setArtistName(e.target.value)}
              placeholder='Artist name on this platform'
              className='w-full rounded-lg border border-subtle bg-surface-0 px-3 py-2 text-[13px] text-primary-token placeholder:text-quaternary-token focus:outline-none focus:ring-1 focus:ring-[#7170ff]/50'
            />
            <input
              type='text'
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder={PROVIDER_PLACEHOLDERS[selectedProvider]}
              className='w-full rounded-lg border border-subtle bg-surface-0 px-3 py-2 text-[13px] text-primary-token placeholder:text-quaternary-token focus:outline-none focus:ring-1 focus:ring-[#7170ff]/50'
            />
            {error && <p className='text-[12px] text-red-500'>{error}</p>}
            <Button
              variant='primary'
              size='sm'
              disabled={!url || !artistName || isPending}
              onClick={handleSubmit}
            >
              {isPending ? 'Adding...' : 'Add Platform'}
            </Button>
          </>
        )}
      </div>
    </Dialog>
  );
}
