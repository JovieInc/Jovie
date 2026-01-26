'use client';

import { Button, Switch } from '@jovie/ui';
import { Eye, EyeOff, ExternalLink } from 'lucide-react';
import { type FormEvent, useCallback, useState } from 'react';
import { Input } from '@/components/atoms/Input';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { usePixelSettingsMutation } from '@/lib/queries';

const SETTINGS_BUTTON_CLASS = 'w-full sm:w-auto';

const INPUT_CLASS =
  'block w-full px-3 py-2 border border-subtle rounded-lg bg-surface-1 text-primary placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base focus-visible:border-transparent sm:text-sm shadow-sm transition-colors';

interface PlatformSectionProps {
  platform: string;
  pixelIdLabel: string;
  pixelIdPlaceholder: string;
  pixelIdName: string;
  pixelIdValue: string;
  tokenLabel: string;
  tokenPlaceholder: string;
  tokenName: string;
  tokenValue: string;
  helpUrl: string;
  helpText: string;
  onPixelIdChange: (value: string) => void;
  onTokenChange: (value: string) => void;
}

function PlatformSection({
  platform,
  pixelIdLabel,
  pixelIdPlaceholder,
  pixelIdName,
  pixelIdValue,
  tokenLabel,
  tokenPlaceholder,
  tokenName,
  tokenValue,
  helpUrl,
  helpText,
  onPixelIdChange,
  onTokenChange,
}: PlatformSectionProps) {
  const [showToken, setShowToken] = useState(false);

  return (
    <div className='space-y-4 p-4 bg-surface-0 rounded-lg border border-subtle'>
      <div className='flex items-center justify-between'>
        <h4 className='text-sm font-medium text-primary'>{platform}</h4>
        <a
          href={helpUrl}
          target='_blank'
          rel='noopener noreferrer'
          className='text-xs text-interactive hover:text-interactive/80 flex items-center gap-1'
        >
          {helpText}
          <ExternalLink className='h-3 w-3' />
        </a>
      </div>

      <div className='grid gap-4 sm:grid-cols-2'>
        <div>
          <label
            htmlFor={pixelIdName}
            className='block text-xs font-medium text-primary-token mb-2'
          >
            {pixelIdLabel}
          </label>
          <Input
            type='text'
            id={pixelIdName}
            name={pixelIdName}
            value={pixelIdValue}
            onChange={e => onPixelIdChange(e.target.value)}
            placeholder={pixelIdPlaceholder}
            inputClassName={INPUT_CLASS}
          />
        </div>

        <div>
          <label
            htmlFor={tokenName}
            className='block text-xs font-medium text-primary-token mb-2'
          >
            {tokenLabel}
          </label>
          <div className='relative'>
            <Input
              type={showToken ? 'text' : 'password'}
              id={tokenName}
              name={tokenName}
              value={tokenValue}
              onChange={e => onTokenChange(e.target.value)}
              placeholder={tokenPlaceholder}
              inputClassName={`${INPUT_CLASS} pr-10`}
            />
            <button
              type='button'
              onClick={() => setShowToken(!showToken)}
              className='absolute inset-y-0 right-0 flex items-center pr-3 text-secondary-token hover:text-primary-token'
              aria-label={showToken ? 'Hide token' : 'Show token'}
            >
              {showToken ? (
                <EyeOff className='h-4 w-4' />
              ) : (
                <Eye className='h-4 w-4' />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettingsAdPixelsSection() {
  const { mutate: savePixels, isPending: isPixelSaving } =
    usePixelSettingsMutation();

  const [pixelData, setPixelData] = useState({
    facebookPixelId: '',
    facebookAccessToken: '',
    googleMeasurementId: '',
    googleApiSecret: '',
    tiktokPixelId: '',
    tiktokAccessToken: '',
    enabled: true,
  });

  const handleInputChange = (field: string, value: string | boolean) => {
    setPixelData(prev => ({ ...prev, [field]: value }));
  };

  const handlePixelSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      const formData = new FormData(e.currentTarget);
      savePixels({
        facebookPixelId: (formData.get('facebookPixelId') as string) ?? '',
        facebookAccessToken:
          (formData.get('facebookAccessToken') as string) ?? '',
        googleMeasurementId:
          (formData.get('googleMeasurementId') as string) ?? '',
        googleApiSecret: (formData.get('googleApiSecret') as string) ?? '',
        tiktokPixelId: (formData.get('tiktokPixelId') as string) ?? '',
        tiktokAccessToken: (formData.get('tiktokAccessToken') as string) ?? '',
        enabled: pixelData.enabled,
      });
    },
    [savePixels, pixelData.enabled]
  );

  return (
    <form onSubmit={handlePixelSubmit} className='space-y-6'>
      <DashboardCard variant='settings'>
        <div className='flex items-center justify-between mb-6'>
          <div>
            <h3 className='text-lg font-medium text-primary'>
              Server-Side Pixel Tracking
            </h3>
            <p className='text-sm text-secondary-token mt-1'>
              Track conversions via server-side APIs for better accuracy and
              privacy.
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <span className='text-sm text-secondary-token'>
              {pixelData.enabled ? 'Enabled' : 'Disabled'}
            </span>
            <Switch
              checked={pixelData.enabled}
              onCheckedChange={checked => handleInputChange('enabled', checked)}
              aria-label='Enable pixel tracking'
            />
          </div>
        </div>

        <div className='space-y-4'>
          <PlatformSection
            platform='Facebook Conversions API'
            pixelIdLabel='Pixel ID'
            pixelIdPlaceholder='1234567890123456'
            pixelIdName='facebookPixelId'
            pixelIdValue={pixelData.facebookPixelId}
            tokenLabel='Access Token'
            tokenPlaceholder='EAAxxxxxxx...'
            tokenName='facebookAccessToken'
            tokenValue={pixelData.facebookAccessToken}
            helpUrl='https://www.facebook.com/business/help/952192354843755'
            helpText='Get credentials'
            onPixelIdChange={value =>
              handleInputChange('facebookPixelId', value)
            }
            onTokenChange={value =>
              handleInputChange('facebookAccessToken', value)
            }
          />

          <PlatformSection
            platform='Google Analytics 4 (Measurement Protocol)'
            pixelIdLabel='Measurement ID'
            pixelIdPlaceholder='G-XXXXXXXXXX'
            pixelIdName='googleMeasurementId'
            pixelIdValue={pixelData.googleMeasurementId}
            tokenLabel='API Secret'
            tokenPlaceholder='xxxxxxxxxx'
            tokenName='googleApiSecret'
            tokenValue={pixelData.googleApiSecret}
            helpUrl='https://developers.google.com/analytics/devguides/collection/protocol/ga4'
            helpText='Get credentials'
            onPixelIdChange={value =>
              handleInputChange('googleMeasurementId', value)
            }
            onTokenChange={value => handleInputChange('googleApiSecret', value)}
          />

          <PlatformSection
            platform='TikTok Events API'
            pixelIdLabel='Pixel Code'
            pixelIdPlaceholder='CXXXXXXXXXX'
            pixelIdName='tiktokPixelId'
            pixelIdValue={pixelData.tiktokPixelId}
            tokenLabel='Access Token'
            tokenPlaceholder='xxxxxxxxxx'
            tokenName='tiktokAccessToken'
            tokenValue={pixelData.tiktokAccessToken}
            helpUrl='https://ads.tiktok.com/marketing_api/docs?id=1771101027431425'
            helpText='Get credentials'
            onPixelIdChange={value =>
              handleInputChange('tiktokPixelId', value)
            }
            onTokenChange={value =>
              handleInputChange('tiktokAccessToken', value)
            }
          />
        </div>

        <div className='mt-6 p-4 bg-surface-1 rounded-lg'>
          <h4 className='text-sm font-medium text-primary mb-2'>
            How it works
          </h4>
          <ul className='text-xs text-secondary-token space-y-1'>
            <li>
              Events from your profile (page views, link clicks) are sent
              server-side to your ad platforms.
            </li>
            <li>
              No JavaScript loaded on your profile - faster page loads for
              visitors.
            </li>
            <li>
              Better tracking accuracy - bypasses ad blockers and browser
              restrictions.
            </li>
            <li>
              Your credentials are encrypted and never exposed to visitors.
            </li>
          </ul>
        </div>
      </DashboardCard>

      <div className='flex justify-end pt-2'>
        <Button
          type='submit'
          loading={isPixelSaving}
          className={SETTINGS_BUTTON_CLASS}
        >
          Save pixel settings
        </Button>
      </div>
    </form>
  );
}
