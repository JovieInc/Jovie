'use client';

import { Button } from '@jovie/ui';
import { type FormEvent, useCallback, useState } from 'react';
import { Input } from '@/components/atoms/Input';
import { Textarea } from '@/components/atoms/Textarea';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';

const SETTINGS_BUTTON_CLASS = 'w-full sm:w-auto';

export function SettingsAdPixelsSection() {
  const [isPixelSaving, setIsPixelSaving] = useState(false);
  const [pixelData, setPixelData] = useState({
    facebookPixel: '',
    googleAdsConversion: '',
    tiktokPixel: '',
    customPixel: '',
  });

  const handlePixelInputChange = (field: string, value: string) => {
    setPixelData(prev => ({ ...prev, [field]: value }));
  };

  const handlePixelSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setIsPixelSaving(true);

      try {
        // Read form data from the form element to avoid dependency on state
        const formData = new FormData(e.currentTarget);
        const response = await fetch('/api/dashboard/pixels', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            facebookPixel: formData.get('facebookPixel') ?? '',
            googleAdsConversion: formData.get('googleAdsConversion') ?? '',
            tiktokPixel: formData.get('tiktokPixel') ?? '',
            customPixel: formData.get('customPixel') ?? '',
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to save pixels');
        }

        console.log('Pixels saved successfully');
      } catch (error) {
        console.error('Failed to save pixels:', error);
      } finally {
        setIsPixelSaving(false);
      }
    },
    []
  );

  return (
    <form onSubmit={handlePixelSubmit} className='space-y-6'>
      <DashboardCard variant='settings'>
        <h3 className='text-lg font-medium text-primary mb-6'>Pixel IDs</h3>

        <div className='space-y-6'>
          <div>
            <label
              htmlFor='facebookPixel'
              className='block text-xs font-medium text-primary-token mb-2'
            >
              Facebook Pixel ID
            </label>
            <Input
              type='text'
              id='facebookPixel'
              name='facebookPixel'
              value={pixelData.facebookPixel}
              onChange={e =>
                handlePixelInputChange('facebookPixel', e.target.value)
              }
              placeholder='1234567890'
              inputClassName='block w-full px-3 py-2 border border-subtle rounded-lg bg-surface-1 text-primary placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base focus-visible:border-transparent sm:text-sm shadow-sm transition-colors'
            />
          </div>

          <div>
            <label
              htmlFor='googleAdsConversion'
              className='block text-xs font-medium text-primary-token mb-2'
            >
              Google Ads Conversion ID
            </label>
            <Input
              type='text'
              id='googleAdsConversion'
              name='googleAdsConversion'
              value={pixelData.googleAdsConversion}
              onChange={e =>
                handlePixelInputChange('googleAdsConversion', e.target.value)
              }
              placeholder='AW-123456789'
              inputClassName='block w-full px-3 py-2 border border-subtle rounded-lg bg-surface-1 text-primary placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base focus-visible:border-transparent sm:text-sm shadow-sm transition-colors'
            />
          </div>

          <div>
            <label
              htmlFor='tiktokPixel'
              className='block text-xs font-medium text-primary-token mb-2'
            >
              TikTok Pixel ID
            </label>
            <Input
              type='text'
              id='tiktokPixel'
              name='tiktokPixel'
              value={pixelData.tiktokPixel}
              onChange={e =>
                handlePixelInputChange('tiktokPixel', e.target.value)
              }
              placeholder='ABCDEF1234567890'
              inputClassName='block w-full px-3 py-2 border border-subtle rounded-lg bg-surface-1 text-primary placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base focus-visible:border-transparent sm:text-sm shadow-sm transition-colors'
            />
          </div>

          <div>
            <label
              htmlFor='customPixel'
              className='block text-xs font-medium text-primary-token mb-2'
            >
              Additional Snippet
            </label>
            <Textarea
              id='customPixel'
              name='customPixel'
              rows={4}
              value={pixelData.customPixel}
              onChange={e =>
                handlePixelInputChange('customPixel', e.target.value)
              }
              placeholder='<script>/* your tag */</script>'
              className='block w-full px-3 py-2 border border-subtle rounded-lg bg-surface-1 text-primary placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base focus-visible:border-transparent sm:text-sm shadow-sm resize-none transition-colors'
            />
            <p className='mt-2 text-xs text-secondary-token/70'>
              For other ad networks or tag managers.
            </p>
          </div>
        </div>
      </DashboardCard>

      <div className='flex justify-end pt-2'>
        <Button
          type='submit'
          loading={isPixelSaving}
          className={SETTINGS_BUTTON_CLASS}
        >
          Save pixels
        </Button>
      </div>
    </form>
  );
}
