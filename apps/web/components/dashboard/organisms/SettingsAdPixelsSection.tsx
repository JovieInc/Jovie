'use client';

import { Button, Input, Switch } from '@jovie/ui';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Eye, EyeOff } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { usePixelSettingsMutation } from '@/lib/queries';
import { queryKeys } from '@/lib/queries/keys';

const SETTINGS_BUTTON_CLASS = 'w-full sm:w-auto';

const INPUT_CLASS =
  'block w-full px-3 py-2 border border-subtle rounded-lg bg-surface-1 text-primary placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base focus-visible:border-transparent sm:text-sm shadow-sm transition-colors';

interface PlatformSectionProps {
  readonly platform: string;
  readonly pixelIdLabel: string;
  readonly pixelIdPlaceholder: string;
  readonly pixelIdName: string;
  readonly pixelIdValue: string;
  readonly tokenLabel: string;
  readonly tokenPlaceholder: string;
  readonly tokenName: string;
  readonly tokenValue: string;
  readonly helpUrl: string;
  readonly helpText: string;
  readonly onPixelIdChange: (value: string) => void;
  readonly onTokenChange: (value: string) => void;
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
          <ExternalLink className='h-4 w-4' />
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
            className={INPUT_CLASS}
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
              className={`${INPUT_CLASS} pr-10`}
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

// Token placeholder shown when a token is configured but not revealed
const TOKEN_PLACEHOLDER = '••••••••';

interface PixelSettingsResponse {
  pixels: {
    facebookPixelId: string | null;
    googleMeasurementId: string | null;
    tiktokPixelId: string | null;
    enabled: boolean;
    facebookEnabled: boolean;
    googleEnabled: boolean;
    tiktokEnabled: boolean;
  };
  hasTokens: {
    facebook: boolean;
    google: boolean;
    tiktok: boolean;
  };
}

export function SettingsAdPixelsSection() {
  const { mutate: savePixels, isPending: isPixelSaving } =
    usePixelSettingsMutation();

  // Fetch existing pixel settings on mount
  const { data: existingSettings } = useQuery<PixelSettingsResponse>({
    queryKey: queryKeys.pixels.settings(),
    queryFn: async ({ signal }) => {
      const res = await fetch('/api/dashboard/pixels', { signal });
      if (!res.ok) throw new Error('Failed to fetch pixel settings');
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - pixel settings rarely change
  });

  const [pixelData, setPixelData] = useState({
    facebookPixelId: '',
    facebookAccessToken: '',
    googleMeasurementId: '',
    googleApiSecret: '',
    tiktokPixelId: '',
    tiktokAccessToken: '',
    enabled: true,
  });

  // Track whether tokens have been modified (to know whether to send them)
  const [tokenModified, setTokenModified] = useState({
    facebook: false,
    google: false,
    tiktok: false,
  });

  // Populate form with existing settings when fetched
  useEffect(() => {
    if (existingSettings?.pixels) {
      setPixelData(prev => ({
        ...prev,
        facebookPixelId: existingSettings.pixels.facebookPixelId ?? '',
        googleMeasurementId: existingSettings.pixels.googleMeasurementId ?? '',
        tiktokPixelId: existingSettings.pixels.tiktokPixelId ?? '',
        enabled: existingSettings.pixels.enabled ?? true,
        // Show placeholder for configured tokens (actual values not returned by API)
        facebookAccessToken: existingSettings.hasTokens?.facebook
          ? TOKEN_PLACEHOLDER
          : '',
        googleApiSecret: existingSettings.hasTokens?.google
          ? TOKEN_PLACEHOLDER
          : '',
        tiktokAccessToken: existingSettings.hasTokens?.tiktok
          ? TOKEN_PLACEHOLDER
          : '',
      }));
      // Reset token modified flags when settings are loaded
      setTokenModified({ facebook: false, google: false, tiktok: false });
    }
  }, [existingSettings]);

  const handleInputChange = (field: string, value: string | boolean) => {
    setPixelData(prev => ({ ...prev, [field]: value }));
    // Track when token fields are modified
    if (field === 'facebookAccessToken') {
      setTokenModified(prev => ({ ...prev, facebook: true }));
    } else if (field === 'googleApiSecret') {
      setTokenModified(prev => ({ ...prev, google: true }));
    } else if (field === 'tiktokAccessToken') {
      setTokenModified(prev => ({ ...prev, tiktok: true }));
    }
  };

  const handlePixelSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      const formData = new FormData(e.currentTarget);

      // Only send token values if they were actually modified
      const getTokenIfModified = (
        field: string,
        platform: keyof typeof tokenModified
      ): string => {
        const value = formData.get(field) as string;
        if (!tokenModified[platform] || value === TOKEN_PLACEHOLDER) return '';
        return value ?? '';
      };

      savePixels({
        facebookPixelId: (formData.get('facebookPixelId') as string) ?? '',
        facebookAccessToken: getTokenIfModified(
          'facebookAccessToken',
          'facebook'
        ),
        googleMeasurementId:
          (formData.get('googleMeasurementId') as string) ?? '',
        googleApiSecret: getTokenIfModified('googleApiSecret', 'google'),
        tiktokPixelId: (formData.get('tiktokPixelId') as string) ?? '',
        tiktokAccessToken: getTokenIfModified('tiktokAccessToken', 'tiktok'),
        enabled: pixelData.enabled,
      });
    },
    [savePixels, pixelData.enabled, tokenModified]
  );

  return (
    <form onSubmit={handlePixelSubmit} className='space-y-6'>
      <DashboardCard
        variant='settings'
        padding='none'
        className='divide-y divide-subtle'
      >
        <div className='flex items-center justify-between px-5 py-4'>
          <span className='text-sm text-primary-token'>Pixel tracking</span>
          <div className='flex items-center gap-2'>
            <span className='text-xs text-secondary-token'>
              {pixelData.enabled ? 'Enabled' : 'Disabled'}
            </span>
            <Switch
              checked={pixelData.enabled}
              onCheckedChange={checked => handleInputChange('enabled', checked)}
              aria-label='Enable pixel tracking'
            />
          </div>
        </div>

        <div className='px-5 py-4 space-y-4'>
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
            onPixelIdChange={value => handleInputChange('tiktokPixelId', value)}
            onTokenChange={value =>
              handleInputChange('tiktokAccessToken', value)
            }
          />
        </div>

        <div className='px-5 py-4'>
          <p className='text-xs text-secondary-token'>
            Events are sent server-side for better accuracy. No third-party
            JavaScript on your profile. Credentials are encrypted.
          </p>
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
