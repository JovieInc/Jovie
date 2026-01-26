'use client';

import { Button, Input } from '@jovie/ui';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import type { TourDateViewModel } from '@/app/app/dashboard/tour-dates/actions';
import { Icon } from '@/components/atoms/Icon';
import { useConnectBandsintownMutation } from '@/lib/queries/useTourDateMutations';

interface TourDatesEmptyStateProps {
  profileId: string;
  onConnected?: (tourDates: TourDateViewModel[]) => void;
}

export function TourDatesEmptyState({
  profileId,
  onConnected,
}: TourDatesEmptyStateProps) {
  const [artistName, setArtistName] = useState('');
  const connectMutation = useConnectBandsintownMutation(profileId);

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
