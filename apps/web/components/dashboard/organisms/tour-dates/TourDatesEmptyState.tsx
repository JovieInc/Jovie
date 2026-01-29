'use client';

import { Button, Input } from '@jovie/ui';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import type { TourDateViewModel } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { Icon } from '@/components/atoms/Icon';
import {
  useConnectBandsintownMutation,
  useSaveBandsintownApiKeyMutation,
} from '@/lib/queries/useTourDateMutations';

interface TourDatesEmptyStateProps {
  profileId: string;
  hasApiKey: boolean;
  onConnected?: (tourDates: TourDateViewModel[]) => void;
  onApiKeySaved?: () => void;
}

export function TourDatesEmptyState({
  profileId,
  hasApiKey,
  onConnected,
  onApiKeySaved,
}: TourDatesEmptyStateProps) {
  const [apiKey, setApiKey] = useState('');
  const [artistName, setArtistName] = useState('');
  const saveApiKeyMutation = useSaveBandsintownApiKeyMutation(profileId);
  const connectMutation = useConnectBandsintownMutation(profileId);

  const handleSaveApiKey = useCallback(async () => {
    if (!apiKey.trim()) {
      toast.error('Please enter your Bandsintown API key');
      return;
    }

    try {
      const result = await saveApiKeyMutation.mutateAsync({
        apiKey: apiKey.trim(),
      });

      if (result.success) {
        toast.success(result.message);
        setApiKey('');
        onApiKeySaved?.();
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error('Failed to save API key');
    }
  }, [apiKey, saveApiKeyMutation, onApiKeySaved]);

  const handleConnect = useCallback(async () => {
    if (!artistName.trim()) {
      toast.error('Please enter your Bandsintown artist name');
      return;
    }

    try {
      const result = await connectMutation.mutateAsync({
        artistName: artistName.trim(),
      });

      if (result.success) {
        toast.success(result.message);
        onConnected?.(result.tourDates);
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error('Failed to connect Bandsintown');
    }
  }, [artistName, connectMutation, onConnected]);

  // Step 1: API Key Setup
  if (!hasApiKey) {
    return (
      <div className='flex flex-col items-center justify-center px-4 py-16 text-center sm:px-6'>
        <div className='flex h-16 w-16 items-center justify-center rounded-full bg-surface-2'>
          <Icon
            name='Key'
            className='h-8 w-8 text-tertiary-token'
            aria-hidden='true'
          />
        </div>
        <h3 className='mt-4 text-lg font-semibold text-primary-token'>
          Set up Bandsintown Integration
        </h3>
        <p className='mt-1 max-w-md text-sm text-secondary-token'>
          To sync your tour dates, you'll need a free Bandsintown API key.
        </p>

        <div className='mt-6 w-full max-w-md text-left'>
          <ol className='mb-6 list-decimal space-y-2 pl-5 text-sm text-secondary-token'>
            <li>
              Visit{' '}
              <a
                href='https://artists.bandsintown.com'
                target='_blank'
                rel='noopener noreferrer'
                className='text-primary-token underline hover:no-underline'
              >
                artists.bandsintown.com
              </a>
            </li>
            <li>Sign in or create an account</li>
            <li>Go to Settings &rarr; API &rarr; Generate Key</li>
            <li>Copy your API key and paste it below</li>
          </ol>

          <div className='flex flex-col gap-3'>
            <Input
              type='password'
              inputSize='lg'
              placeholder='Your Bandsintown API key'
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              disabled={saveApiKeyMutation.isPending}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveApiKey();
                }
              }}
            />
            <Button
              onClick={handleSaveApiKey}
              disabled={saveApiKeyMutation.isPending || !apiKey.trim()}
              className='w-full'
            >
              {saveApiKeyMutation.isPending ? (
                <>
                  <Icon
                    name='Loader2'
                    className='mr-2 h-4 w-4 animate-spin'
                    aria-hidden='true'
                  />
                  Saving...
                </>
              ) : (
                <>
                  <Icon
                    name='Key'
                    className='mr-2 h-4 w-4'
                    aria-hidden='true'
                  />
                  Save API Key
                </>
              )}
            </Button>
          </div>

          <p className='mt-4 text-center text-xs text-tertiary-token'>
            Your API key is encrypted and stored securely.
          </p>
        </div>
      </div>
    );
  }

  // Step 2: Artist Connection
  return (
    <div className='flex flex-col items-center justify-center px-4 py-16 text-center sm:px-6'>
      <div className='flex h-16 w-16 items-center justify-center rounded-full bg-surface-2'>
        <Icon
          name='CalendarDays'
          className='h-8 w-8 text-tertiary-token'
          aria-hidden='true'
        />
      </div>
      <h3 className='mt-4 text-lg font-semibold text-primary-token'>
        Connect your tour dates
      </h3>
      <p className='mt-1 max-w-sm text-sm text-secondary-token'>
        Enter your Bandsintown artist name to sync your upcoming shows.
      </p>

      <div className='mt-6 w-full max-w-md'>
        <div className='flex flex-col gap-3'>
          <Input
            type='text'
            inputSize='lg'
            placeholder='Your artist name on Bandsintown'
            value={artistName}
            onChange={e => setArtistName(e.target.value)}
            disabled={connectMutation.isPending}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleConnect();
              }
            }}
          />
          <Button
            onClick={handleConnect}
            disabled={connectMutation.isPending || !artistName.trim()}
            className='w-full'
          >
            {connectMutation.isPending ? (
              <>
                <Icon
                  name='Loader2'
                  className='mr-2 h-4 w-4 animate-spin'
                  aria-hidden='true'
                />
                Connecting...
              </>
            ) : (
              <>
                <Icon name='Link' className='mr-2 h-4 w-4' aria-hidden='true' />
                Connect Bandsintown
              </>
            )}
          </Button>
        </div>

        <p className='mt-4 text-xs text-tertiary-token'>
          Your tour dates will sync from Bandsintown and appear here. You can
          also add shows manually.
        </p>
      </div>
    </div>
  );
}
