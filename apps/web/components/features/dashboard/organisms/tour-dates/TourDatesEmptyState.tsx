'use client';

import { Button, Input } from '@jovie/ui';
import { useCallback, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { toast } from '@/components/feedback';
import { EmptyState } from '@/components/molecules/EmptyState';
import {
  useConnectBandsintownMutation,
  useSaveBandsintownApiKeyMutation,
} from '@/lib/queries';
import type { TourDateViewModel } from '@/lib/tour-dates/types';

interface TourDatesEmptyStateProps {
  readonly profileId: string;
  readonly hasApiKey: boolean;
  readonly onConnected?: (tourDates: TourDateViewModel[]) => void;
  readonly onApiKeySaved?: () => void;
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
      toast.error('Please enter your Bandsintown API key'); // ui-casing-allow: product name
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
      toast.error('Please enter your Bandsintown artist name'); // ui-casing-allow: product name
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
      toast.error('Failed to connect Bandsintown'); // ui-casing-allow: product name
    }
  }, [artistName, connectMutation, onConnected]);

  // Step 1: API key setup. Only reached when no server key is configured.
  if (!hasApiKey) {
    return (
      <EmptyState
        presentation='workspace'
        icon={<Icon name='Key' className='h-5 w-5' aria-hidden='true' />}
        heading='Set Up Bandsintown Integration'
        description='Generate a free API key in Bandsintown under Settings, then API, and paste it here.' // ui-casing-allow: product name
        testId='tour-dates-empty-state-api-key'
        actionSlot={
          <div className='flex w-full flex-col gap-3'>
            <Input
              type='password'
              inputSize='lg'
              placeholder='Your Bandsintown API key' // ui-casing-allow: product name
              aria-label='Bandsintown API Key'
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
                    className='mr-2 h-4 w-4 animate-spin motion-reduce:animate-none'
                    aria-hidden='true'
                  />
                  Saving...
                </>
              ) : (
                'Save API Key'
              )}
            </Button>
            <p className='text-2xs text-tertiary-token'>
              Get a key at{' '}
              <a
                href='https://artists.bandsintown.com'
                target='_blank'
                rel='noopener noreferrer'
                className='text-secondary-token underline underline-offset-2 hover:no-underline'
              >
                artists.bandsintown.com
              </a>
              . Your API key is encrypted and stored securely.
            </p>
          </div>
        }
      />
    );
  }

  // Step 2: artist connection
  return (
    <EmptyState
      presentation='workspace'
      icon={<Icon name='CalendarDays' className='h-5 w-5' aria-hidden='true' />}
      heading='Connect Your Tour Dates'
      description='Enter your Bandsintown artist name to sync your upcoming shows.' // ui-casing-allow: product name
      testId='tour-dates-empty-state-connect'
      actionSlot={
        <div className='flex w-full flex-col gap-3'>
          <Input
            type='text'
            inputSize='lg'
            placeholder='Your artist name on Bandsintown' // ui-casing-allow: product name
            aria-label='Bandsintown Artist Name'
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
                  className='mr-2 h-4 w-4 animate-spin motion-reduce:animate-none'
                  aria-hidden='true'
                />
                Connecting...
              </>
            ) : (
              'Connect Bandsintown'
            )}
          </Button>
        </div>
      }
    />
  );
}
