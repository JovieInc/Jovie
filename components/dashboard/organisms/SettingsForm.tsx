'use client';

import { useState } from 'react';
import { updateCreatorProfile } from '@/app/dashboard/actions';
import { Artist } from '@/types/db';

interface SettingsFormProps {
  artist: Artist;
  onUpdate: (artist: Artist) => void;
}

export function SettingsForm({ artist, onUpdate }: SettingsFormProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [marketingOptOut, setMarketingOptOut] = useState(
    artist.marketing_opt_out || false
  );
  const [showSuccess, setShowSuccess] = useState(false);

  const handleMarketingOptOutChange = async (optedOut: boolean) => {
    try {
      setIsUpdating(true);
      setMarketingOptOut(optedOut);

      // Update the profile in the database
      await updateCreatorProfile(artist.id, {
        marketingOptOut: optedOut,
      });

      // Update the local artist state
      const updatedArtist = {
        ...artist,
        marketing_opt_out: optedOut,
      };

      onUpdate(updatedArtist);
      setShowSuccess(true);

      // Hide success message after 3 seconds
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error('Error updating marketing preferences:', error);
      // Revert the local state on error
      setMarketingOptOut(!optedOut);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className='space-y-6'>
      <div>
        <h2 className='text-lg font-semibold text-primary-token mb-4'>
          Account Settings
        </h2>
        <p className='text-sm text-secondary-token mb-6'>
          Manage your account preferences and privacy settings.
        </p>
      </div>

      {/* Marketing Preferences Section */}
      <div className='bg-surface-1 border border-subtle rounded-lg p-6'>
        <h3 className='text-base font-medium text-primary-token mb-4'>
          Marketing & Promotion
        </h3>
        <div className='space-y-4'>
          <div className='flex items-start space-x-3'>
            <div className='flex items-center h-5'>
              <input
                id='marketing-opt-out'
                type='checkbox'
                checked={marketingOptOut}
                onChange={e => handleMarketingOptOutChange(e.target.checked)}
                disabled={isUpdating}
                aria-label='Opt out of marketing materials'
                className='w-5 h-5 text-indigo-600 bg-surface-1 border-subtle rounded focus-visible:ring-indigo-500 dark:focus-visible:ring-indigo-600 dark:ring-offset-gray-800 focus-visible:ring-2 disabled:opacity-50'
              />
            </div>
            <div className='text-sm'>
              <label
                htmlFor='marketing-opt-out'
                className='font-medium text-primary-token'
              >
                Opt out of marketing materials
              </label>
              <p className='text-secondary-token mt-1'>
                When enabled, your profile will not be featured on our homepage
                or used in marketing materials. You can change this setting at
                any time.
              </p>
            </div>
          </div>

          {showSuccess && (
            <div className='flex items-center space-x-2 text-sm text-green-600 dark:text-green-400'>
              <svg className='w-4 h-4' fill='currentColor' viewBox='0 0 20 20'>
                <path
                  fillRule='evenodd'
                  d='M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z'
                  clipRule='evenodd'
                />
              </svg>
              <span>Settings updated successfully</span>
            </div>
          )}
        </div>
      </div>

      {/* Future Settings Sections */}
      <div className='bg-surface-2 border border-subtle rounded-lg p-6'>
        <h3 className='text-base font-medium text-primary-token mb-2'>
          Additional Settings
        </h3>
        <p className='text-sm text-secondary-token'>
          More account and privacy settings will be available here in the
          future.
        </p>
      </div>
    </div>
  );
}
