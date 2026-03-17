'use client';

import { Button, Input, Switch } from '@jovie/ui';
import { ExternalLink, Eye, EyeOff } from 'lucide-react';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { PixelsSectionSkeleton } from '@/components/molecules/SettingsLoadingSkeleton';
import { DashboardCard } from '@/features/dashboard/atoms/DashboardCard';
import { useSaveStatus } from '@/features/dashboard/hooks/useSaveStatus';
import { SettingsErrorState } from '@/features/dashboard/molecules/SettingsErrorState';
import { SettingsStatusPill } from '@/features/dashboard/molecules/SettingsStatusPill';
import { SettingsToggleRow } from '@/features/dashboard/molecules/SettingsToggleRow';
import { usePixelSettingsMutation, usePixelSettingsQuery } from '@/lib/queries';

const SETTINGS_BUTTON_CLASS = 'w-full sm:w-auto';

const INPUT_CLASS =
  'block w-full rounded-[8px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) px-3 py-2 text-[13px] text-(--linear-text-primary) placeholder:text-(--linear-text-tertiary) transition-[background-color,border-color,box-shadow] duration-150 focus-visible:border-(--linear-border-focus) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/20';

interface PlatformSectionProps {
  readonly platform: string;
  readonly description: string;
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
  readonly isConfigured: boolean;
}

function PlatformSection({
  platform,
  description,
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
  isConfigured,
}: PlatformSectionProps) {
  const [showToken, setShowToken] = useState(false);

  return (
    <ContentSurfaceCard className='space-y-4 bg-(--linear-bg-surface-0) p-4'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <h4 className='text-[13px] font-[560] tracking-[-0.01em] text-(--linear-text-primary)'>
            {platform}
          </h4>
          <p className='mt-1 text-[13px] leading-[18px] text-(--linear-text-secondary)'>
            {description}
          </p>
        </div>
        <span className='rounded-full border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) px-2 py-0.5 text-[11px] font-[560] uppercase tracking-[0.08em] text-(--linear-text-secondary)'>
          {isConfigured ? 'Configured' : 'Not configured'}
        </span>
      </div>

      <a
        href={helpUrl}
        target='_blank'
        rel='noopener noreferrer'
        className='inline-flex items-center gap-1.5 text-[12.5px] font-[510] text-(--linear-text-secondary) transition-colors hover:text-(--linear-text-primary)'
      >
        {helpText}
        <ExternalLink className='h-3.5 w-3.5' />
      </a>

      <div className='grid gap-4 sm:grid-cols-2'>
        <div>
          <label
            htmlFor={pixelIdName}
            className='mb-2 block text-[11px] font-[560] uppercase tracking-[0.06em] text-(--linear-text-tertiary)'
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
            className='mb-2 block text-[11px] font-[560] uppercase tracking-[0.06em] text-(--linear-text-tertiary)'
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
              className='absolute inset-y-0 right-0 flex items-center pr-3 text-(--linear-text-tertiary) transition-colors hover:text-(--linear-text-primary)'
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
    </ContentSurfaceCard>
  );
}

// Token placeholder shown when a token is configured but not revealed
const TOKEN_PLACEHOLDER = '••••••••';

export interface SettingsAdPixelsSectionProps {
  readonly isPro?: boolean;
}

export function SettingsAdPixelsSection({
  isPro = true,
}: SettingsAdPixelsSectionProps) {
  const { mutateAsync: savePixels, isPending: isPixelSaving } =
    usePixelSettingsMutation();
  const {
    status: saveStatus,
    markSaving,
    markSuccess,
    markError,
    resetStatus,
  } = useSaveStatus();

  // Fetch existing pixel settings on mount
  const {
    data: existingSettings,
    isLoading,
    isError,
    refetch,
  } = usePixelSettingsQuery({ enabled: isPro });

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

  const baselineValues = useMemo(
    () => ({
      facebookPixelId: existingSettings?.pixels.facebookPixelId ?? '',
      googleMeasurementId: existingSettings?.pixels.googleMeasurementId ?? '',
      tiktokPixelId: existingSettings?.pixels.tiktokPixelId ?? '',
      enabled: existingSettings?.pixels.enabled ?? true,
    }),
    [existingSettings]
  );

  const hasUnsavedChanges =
    pixelData.facebookPixelId !== baselineValues.facebookPixelId ||
    pixelData.googleMeasurementId !== baselineValues.googleMeasurementId ||
    pixelData.tiktokPixelId !== baselineValues.tiktokPixelId ||
    pixelData.enabled !== baselineValues.enabled ||
    tokenModified.facebook ||
    tokenModified.google ||
    tokenModified.tiktok;

  // Populate form with existing settings when fetched
  useEffect(() => {
    if (!isPro) return;
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
      resetStatus();
    }
  }, [existingSettings, isPro, resetStatus]);

  const handleInputChange = (field: string, value: string | boolean) => {
    setPixelData(prev => ({ ...prev, [field]: value }));
    resetStatus();
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
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!hasUnsavedChanges) return;

      // Only send token values if they were actually modified
      const getTokenIfModified = (
        tokenValue: string,
        platform: keyof typeof tokenModified
      ): string => {
        if (!tokenModified[platform] || tokenValue === TOKEN_PLACEHOLDER) {
          return '';
        }
        return tokenValue;
      };

      try {
        markSaving();
        await savePixels({
          facebookPixelId: pixelData.facebookPixelId,
          facebookAccessToken: getTokenIfModified(
            pixelData.facebookAccessToken,
            'facebook'
          ),
          googleMeasurementId: pixelData.googleMeasurementId,
          googleApiSecret: getTokenIfModified(
            pixelData.googleApiSecret,
            'google'
          ),
          tiktokPixelId: pixelData.tiktokPixelId,
          tiktokAccessToken: getTokenIfModified(
            pixelData.tiktokAccessToken,
            'tiktok'
          ),
          enabled: pixelData.enabled,
        });
        markSuccess();
        setTokenModified({ facebook: false, google: false, tiktok: false });
      } catch {
        markError('Failed to save. Try again.');
      }
    },
    [
      hasUnsavedChanges,
      markError,
      markSaving,
      markSuccess,
      pixelData,
      savePixels,
      tokenModified,
    ]
  );

  if (!isPro) {
    return (
      <DashboardCard
        variant='settings'
        padding='none'
        className='overflow-hidden'
      >
        <ContentSectionHeader
          title='Pixel tracking'
          subtitle='Integrate Facebook, Google, and TikTok conversion tracking pixels.'
          className='min-h-0 px-4 py-3'
        />
        <div className='px-4 py-3'>
          <ContentSurfaceCard className='bg-(--linear-bg-surface-0) px-4 py-3.5'>
            <SettingsToggleRow
              title='Pixel tracking'
              description='Integrate Facebook, Google, and TikTok conversion tracking pixels.'
              checked={false}
              onCheckedChange={() => {}}
              ariaLabel='Pixel tracking'
              gated
            />
          </ContentSurfaceCard>
        </div>
      </DashboardCard>
    );
  }

  if (isLoading) {
    return (
      <DashboardCard
        variant='settings'
        padding='none'
        className='overflow-hidden'
      >
        <ContentSectionHeader
          title='Pixel tracking'
          subtitle='Integrate Facebook, Google, and TikTok conversion tracking pixels.'
          className='min-h-0 px-4 py-3'
        />
        <div className='px-4 py-3'>
          <PixelsSectionSkeleton />
        </div>
      </DashboardCard>
    );
  }

  if (isError) {
    return (
      <SettingsErrorState
        message='Failed to load pixel settings.'
        onRetry={() => refetch()}
      />
    );
  }

  // Check if any pixels are configured
  const hasAnyPixels =
    existingSettings?.pixels?.facebookPixelId ||
    existingSettings?.pixels?.googleMeasurementId ||
    existingSettings?.pixels?.tiktokPixelId;

  return (
    <form onSubmit={handlePixelSubmit} className='space-y-6'>
      <DashboardCard
        variant='settings'
        padding='none'
        className='overflow-hidden'
      >
        <ContentSectionHeader
          title='Pixel tracking'
          subtitle='Integrate Facebook, Google, and TikTok conversion tracking pixels.'
          className='min-h-0 px-4 py-3'
          actionsClassName='w-auto shrink-0'
          actions={
            <div className='flex items-center gap-2'>
              <span className='text-[11px] font-[560] uppercase tracking-[0.08em] text-(--linear-text-tertiary)'>
                {pixelData.enabled ? 'Enabled' : 'Disabled'}
              </span>
              <Switch
                checked={pixelData.enabled}
                onCheckedChange={checked =>
                  handleInputChange('enabled', checked)
                }
                aria-label='Enable pixel tracking'
              />
            </div>
          }
        />

        <div className='space-y-3 px-4 py-3'>
          {!hasAnyPixels && (
            <ContentSurfaceCard className='bg-(--linear-bg-surface-0) px-6 py-5 text-center'>
              <p className='text-[13px] leading-[18px] text-secondary-token'>
                No tracking pixels configured yet. Add your first destination to
                start tracking conversions.
              </p>
            </ContentSurfaceCard>
          )}

          <ContentSurfaceCard className='bg-(--linear-bg-surface-0) px-4 py-3.5'>
            <p className='text-[13px] leading-[18px] text-secondary-token'>
              Configure each retargeting destination independently.
            </p>
          </ContentSurfaceCard>

          <PlatformSection
            platform='Facebook Conversions API'
            description='Track profile views and link clicks in Meta Ads Manager.'
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
            isConfigured={
              !!(
                existingSettings?.pixels.facebookPixelId &&
                existingSettings?.hasTokens.facebook
              )
            }
            onPixelIdChange={value =>
              handleInputChange('facebookPixelId', value)
            }
            onTokenChange={value =>
              handleInputChange('facebookAccessToken', value)
            }
          />

          <PlatformSection
            platform='Google Analytics 4 (Measurement Protocol)'
            description='Send conversion events directly to your GA4 property.'
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
            isConfigured={
              !!(
                existingSettings?.pixels.googleMeasurementId &&
                existingSettings?.hasTokens.google
              )
            }
            onPixelIdChange={value =>
              handleInputChange('googleMeasurementId', value)
            }
            onTokenChange={value => handleInputChange('googleApiSecret', value)}
          />

          <PlatformSection
            platform='TikTok Events API'
            description='Measure profile engagement and optimize TikTok campaigns.'
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
            isConfigured={
              !!(
                existingSettings?.pixels.tiktokPixelId &&
                existingSettings?.hasTokens.tiktok
              )
            }
            onPixelIdChange={value => handleInputChange('tiktokPixelId', value)}
            onTokenChange={value =>
              handleInputChange('tiktokAccessToken', value)
            }
          />

          <ContentSurfaceCard className='bg-(--linear-bg-surface-0) px-4 py-3.5'>
            <p className='text-[13px] leading-[18px] text-secondary-token'>
              Events are sent server-side for better accuracy. No third-party
              JavaScript is injected on your profile, and credentials are
              encrypted.
            </p>
          </ContentSurfaceCard>
        </div>
      </DashboardCard>

      <div className='flex items-center justify-end gap-3 pt-2'>
        <SettingsStatusPill status={saveStatus} />
        <Button
          type='submit'
          loading={isPixelSaving || undefined}
          disabled={isPixelSaving || !hasUnsavedChanges}
          className={SETTINGS_BUTTON_CLASS}
        >
          Save pixel settings
        </Button>
      </div>
    </form>
  );
}
