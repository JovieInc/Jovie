'use client';

import { WalletIcon } from '@heroicons/react/24/outline';
import { Button, Input } from '@jovie/ui';
import { useCallback, useState } from 'react';
import type { DashboardData } from '@/app/dashboard/actions';
import { SectionHeader } from '@/components/dashboard/molecules/SectionHeader';
import { cn } from '@/lib/utils';
import { zIndex } from '@/lib/utils/z-index';
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
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
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
      setSaveSuccess(`Connected to @${venmoHandle}`);
      // Clear success after a short delay
      setTimeout(() => setSaveSuccess(null), 2500);
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
        <h1 className='text-2xl font-bold text-primary-token'>Earnings</h1>
        <p className='text-secondary-token mt-1'>
          Connect your payout handle and view your earnings history
        </p>
      </div>

      {/* Venmo Handle Setup - Always Visible — border tokens normalized to border-subtle for consistency with dashboard */}
      <div
        className={cn(
          'mb-6 bg-surface-1 backdrop-blur-sm rounded-lg border p-6 transition-all duration-300 relative border-subtle hover:shadow-md',
          zIndex.dropdown
        )}
      >
        <SectionHeader
          className='mb-4 px-0 py-0 border-0'
          title='Venmo Handle'
          description={
            hasVenmoHandle
              ? 'Your Venmo handle for receiving tips'
              : 'Your handle will appear on your profile so fans can tip you directly.'
          }
          right={
            !hasVenmoHandle ? (
              <WalletIcon className='h-6 w-6 text-accent' />
            ) : null
          }
        />

        {/* Wizard block: when editing OR not set, show inline setup */}
        {isEditing || !hasVenmoHandle ? (
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
                <Input
                  type='text'
                  id='venmo-handle'
                  value={venmoHandle}
                  onChange={e => setVenmoHandle(e.target.value)}
                  placeholder='your-username'
                  autoFocus
                />
              </div>
              <p className='text-xs text-secondary-token mt-2'>
                Your handle will be shown on your public profile and fans can
                tip you directly via Venmo.
              </p>
            </div>
            <div className='flex gap-3'>
              <Button
                onClick={handleSaveVenmo}
                disabled={!venmoHandle.trim()}
                loading={isSaving}
                variant='accent'
              >
                {hasVenmoHandle ? 'Update' : 'Connect'}
              </Button>
              {hasVenmoHandle ? (
                <Button
                  onClick={handleCancel}
                  disabled={isSaving}
                  variant='secondary'
                >
                  Cancel
                </Button>
              ) : null}
            </div>
            {saveSuccess && (
              <div
                className='text-sm text-success bg-surface-2 border border-subtle rounded-md px-3 py-2'
                role='status'
                aria-live='polite'
              >
                ✓ {saveSuccess}
              </div>
            )}
          </div>
        ) : hasVenmoHandle ? (
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              <span className='text-sm font-mono bg-surface-2 px-3 py-1 rounded-md text-primary-token'>
                @{artist.venmo_handle}
              </span>
              <span className='text-xs text-success'>✓ Connected</span>
            </div>
            <button
              onClick={() => setIsEditing(true)}
              className='text-sm text-accent hover:text-accent/80 font-medium transition-colors'
            >
              Edit
            </button>
          </div>
        ) : null}
      </div>

      {/* Tipping content - Blurred when no Venmo handle */}
      <div
        className={cn(
          'space-y-6 transition-all duration-300',
          !hasVenmoHandle && 'filter blur-sm pointer-events-none select-none'
        )}
      >
        {/* Earnings Summary */}
        <div className='bg-surface-1 backdrop-blur-sm rounded-lg border border-subtle p-6 hover:shadow-md transition-all duration-300'>
          <SectionHeader
            className='mb-4 px-0 py-0 border-0'
            title='Earnings Summary'
          />
          <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
            <div className='bg-surface-2/50 rounded-lg p-4'>
              <p className='text-sm text-secondary-token'>Total Received</p>
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

        {/* Recent Earnings */}
        <div className='bg-surface-1 backdrop-blur-sm rounded-lg border border-subtle p-6 hover:shadow-lg hover:border-accent/10 transition-all duration-300'>
          <SectionHeader
            className='mb-4 px-0 py-0 border-0'
            title='Recent Earnings'
          />
          <div className='space-y-4'>
            <p className='text-secondary-token'>
              No earnings yet. When you receive tips, they&apos;ll appear here.
            </p>
          </div>
        </div>
      </div>
      {/* Removed overlay CTA; wizard handles setup inline */}
    </div>
  );
}
