'use client';

import { WalletIcon } from '@heroicons/react/24/outline';
import { useCallback, useState } from 'react';
import type { DashboardData } from '@/app/dashboard/actions';
import { cn } from '@/lib/utils';
import { Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';

interface DashboardTippingProps {
  initialData: DashboardData;
}

export function DashboardTipping({ initialData }: DashboardTippingProps) {
  const [artist, setArtist] = useState<Artist | null>(
    initialData.selectedProfile
      ? convertDrizzleCreatorProfileToArtist(initialData.selectedProfile)
      : null
  );
  const [venmoHandle, setVenmoHandle] = useState(artist?.venmo_handle || '');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Note: Profile switching functionality will be implemented in the future

  const handleSaveVenmo = useCallback(async () => {
    if (!artist) return;

    setIsSaving(true);
    try {
      const response = await fetch('/api/dashboard/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          updates: {
            venmo_handle: venmoHandle,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update Venmo handle');
      }

      const updatedArtist = { ...artist, venmo_handle: venmoHandle };
      setArtist(updatedArtist);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update Venmo handle:', error);
    } finally {
      setIsSaving(false);
    }
  }, [venmoHandle, artist]);

  const handleCancel = () => {
    if (!artist) return;
    setVenmoHandle(artist.venmo_handle || '');
    setIsEditing(false);
  };

  if (!artist) {
    return null; // This shouldn't happen given the server-side logic
  }

  const hasVenmoHandle = Boolean(artist.venmo_handle);

  return (
    <div className='relative'>
      <div className='mb-8'>
        <h1 className='text-2xl font-bold text-primary-token'>Tipping</h1>
        <p className='text-secondary-token mt-1'>
          Manage your tipping settings and view your tipping history
        </p>
      </div>

      {/* Venmo Handle Setup - Always Visible */}
      <div
        className={cn(
          'mb-6 bg-surface-1 backdrop-blur-sm rounded-lg border p-6 transition-all duration-300 relative z-20',
          hasVenmoHandle
            ? 'border-subtle hover:border-accent/10'
            : 'border-accent/30 shadow-lg'
        )}
      >
        <div className='flex items-start justify-between mb-4'>
          <div>
            <h3 className='text-lg font-medium text-primary-token'>
              Venmo Handle
            </h3>
            <p className='text-sm text-secondary-token mt-1'>
              {hasVenmoHandle
                ? 'Your Venmo handle for receiving tips'
                : 'Add your Venmo handle to start receiving tips'}
            </p>
          </div>
          {!hasVenmoHandle && <WalletIcon className='h-6 w-6 text-accent' />}
        </div>

        {isEditing ? (
          <div className='space-y-4'>
            <div>
              <label
                htmlFor='venmo-handle'
                className='block text-sm font-medium text-primary-token mb-2'
              >
                Venmo Username
              </label>
              <div className='flex items-center'>
                <span className='text-sm text-secondary-token mr-1'>@</span>
                <input
                  type='text'
                  id='venmo-handle'
                  value={venmoHandle}
                  onChange={e => setVenmoHandle(e.target.value)}
                  placeholder='your-username'
                  className='flex-1 px-3 py-2 border border-subtle rounded-lg bg-surface-0 text-primary-token placeholder:text-tertiary focus:ring-2 focus:ring-accent focus:border-accent transition-colors'
                  autoFocus
                />
              </div>
            </div>
            <div className='flex gap-3'>
              <button
                onClick={handleSaveVenmo}
                disabled={isSaving || !venmoHandle.trim()}
                className='px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:ring-2 focus:ring-accent focus:ring-offset-2'
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className='px-4 py-2 bg-surface-2 text-primary-token rounded-lg hover:bg-surface-3 transition-colors focus:ring-2 focus:ring-accent focus:ring-offset-2'
              >
                Cancel
              </button>
            </div>
          </div>
        ) : hasVenmoHandle ? (
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              <span className='text-sm font-mono bg-surface-2 px-3 py-1 rounded-md text-primary-token'>
                @{artist.venmo_handle}
              </span>
              <span className='text-xs text-secondary-token'>✓ Active</span>
            </div>
            <button
              onClick={() => setIsEditing(true)}
              className='text-sm text-accent hover:text-accent/80 font-medium transition-colors'
            >
              Edit
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className='w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-accent/50 rounded-lg text-accent hover:border-accent hover:bg-accent/5 transition-all duration-200'
          >
            <WalletIcon className='h-5 w-5' />
            <span className='font-medium'>Add Venmo Handle</span>
          </button>
        )}
      </div>

      {/* Tipping content - Blurred when no Venmo handle */}
      <div
        className={cn(
          'space-y-6 transition-all duration-300',
          !hasVenmoHandle && 'filter blur-sm pointer-events-none select-none'
        )}
      >
        {/* Tipping Stats */}
        <div className='bg-surface-1 backdrop-blur-sm rounded-lg border border-subtle p-6 hover:shadow-lg hover:border-accent/10 transition-all duration-300 relative z-10'>
          <h3 className='text-lg font-medium text-primary-token mb-4'>
            Tipping Stats
          </h3>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
            <div className='bg-surface-2/50 rounded-lg p-4'>
              <p className='text-sm text-secondary-token'>
                Total Tips Received
              </p>
              <p className='text-2xl font-bold text-primary-token'>$0.00</p>
            </div>
            <div className='bg-surface-2/50 rounded-lg p-4'>
              <p className='text-sm text-secondary-token'>This Month</p>
              <p className='text-2xl font-bold text-primary-token'>$0.00</p>
            </div>
            <div className='bg-surface-2/50 rounded-lg p-4'>
              <p className='text-sm text-secondary-token'>Tip Count</p>
              <p className='text-2xl font-bold text-primary-token'>0</p>
            </div>
          </div>
        </div>

        {/* Recent Tips */}
        <div className='bg-surface-1 backdrop-blur-sm rounded-lg border border-subtle p-6 hover:shadow-lg hover:border-accent/10 transition-all duration-300 relative z-10'>
          <h3 className='text-lg font-medium text-primary-token mb-4'>
            Recent Tips
          </h3>
          <div className='space-y-4'>
            <p className='text-secondary-token'>
              No tips received yet. When you receive tips, they&apos;ll appear
              here.
            </p>
          </div>
        </div>
      </div>

      {/* Overlay CTA when no Venmo handle */}
      {!hasVenmoHandle && !isEditing && (
        <div className='absolute inset-x-0 top-32 flex justify-center z-30'>
          <div className='bg-surface-1/95 backdrop-blur-md rounded-2xl p-6 max-w-sm text-center shadow-2xl border border-accent/20'>
            <WalletIcon className='h-12 w-12 text-accent mx-auto mb-3' />
            <h3 className='text-lg font-semibold text-primary-token mb-2'>
              Add Your Venmo Handle
            </h3>
            <p className='text-sm text-secondary-token mb-4'>
              Connect your Venmo to start receiving tips from your fans.
            </p>
            <button
              onClick={() => setIsEditing(true)}
              className='px-6 py-2.5 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors focus:ring-2 focus:ring-accent focus:ring-offset-2 font-medium'
            >
              Get Started
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
