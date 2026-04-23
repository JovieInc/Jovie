'use client';

import { Badge, Button, Input, Switch } from '@jovie/ui';
import { ExternalLink, Eye, EyeOff } from 'lucide-react';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { SettingsPanel } from '@/components/features/dashboard/molecules/SettingsPanel';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { PixelsSectionSkeleton } from '@/components/molecules/SettingsLoadingSkeleton';
import { useSaveStatus } from '@/features/dashboard/hooks/useSaveStatus';
import { SettingsErrorState } from '@/features/dashboard/molecules/SettingsErrorState';
import { SettingsStatusPill } from '@/features/dashboard/molecules/SettingsStatusPill';
import { SettingsToggleRow } from '@/features/dashboard/molecules/SettingsToggleRow';
import type { PlatformHealth } from '@/lib/queries';
import {
  usePixelHealthQuery,
  usePixelSettingsMutation,
  usePixelSettingsQuery,
} from '@/lib/queries';

const SETTINGS_BUTTON_CLASS = 'w-full sm:w-auto';

interface PlatformSectionProps {
  readonly platform: string;
  readonly platformKey: TestPlatform;
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
  readonly health?: PlatformHealth;
}

function PlatformSection({
  platform,
  platformKey,
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
  health,
}: PlatformSectionProps) {
  const [showToken, setShowToken] = useState(false);

  return (
    <ContentSurfaceCard className='space-y-4 bg-surface-0 p-4'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <h4 className='text-app font-caption text-primary-token'>
            {platform}
          </h4>
          <p className='mt-1 text-app leading-[18px] text-secondary-token'>
            {description}
          </p>
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          <Badge variant='outline'>
            {isConfigured ? 'Configured' : 'Not configured'}
          </Badge>
          <HealthIndicator health={health} />
          <TestEventButton platform={platformKey} isConfigured={isConfigured} />
        </div>
      </div>

      <a
        href={helpUrl}
        target='_blank'
        rel='noopener noreferrer'
        className='inline-flex items-center gap-1.5 text-[12.5px] font-caption text-secondary-token transition-colors hover:text-primary-token'
      >
        {helpText}
        <ExternalLink className='h-3.5 w-3.5' />
      </a>

      <div className='grid gap-4 sm:grid-cols-2'>
        <div>
          <label
            htmlFor={pixelIdName}
            className='mb-2 block text-2xs font-caption uppercase tracking-[0.06em] text-tertiary-token'
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
            className='text-app'
          />
        </div>

        <div>
          <label
            htmlFor={tokenName}
            className='mb-2 block text-2xs font-caption uppercase tracking-[0.06em] text-tertiary-token'
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
              className='pr-10 text-app'
            />
            <button
              type='button'
              onClick={() => setShowToken(!showToken)}
              className='absolute inset-y-0 right-0 flex items-center pr-3 text-tertiary-token transition-colors hover:text-primary-token'
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

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'inactive';

function HealthIndicator({ health }: { readonly health?: PlatformHealth }) {
  if (!health) return null;

  const config: Record<
    HealthStatus,
    { dot: string; color: string; label: string }
  > = {
    healthy: { dot: '\u25CF', color: 'text-green-500', label: 'Healthy' },
    degraded: { dot: '\u25CF', color: 'text-yellow-500', label: 'Degraded' },
    unhealthy: {
      dot: '\u25CF',
      color: 'text-red-500',
      label: 'Check credentials',
    },
    inactive: {
      dot: '\u25CB',
      color: 'text-tertiary-token',
      label: 'No events',
    },
  };

  const { dot, color, label } = config[health.status];

  return (
    <span
      className={`inline-flex items-center gap-1 text-2xs font-caption ${color}`}
    >
      <span aria-hidden='true'>{dot}</span>
      {label}
    </span>
  );
}

type TestPlatform = 'facebook' | 'google' | 'tiktok';

function TestEventButton({
  platform,
  isConfigured,
}: {
  readonly platform: TestPlatform;
  readonly isConfigured: boolean;
}) {
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleTest = useCallback(async () => {
    setStatus('loading');
    setErrorMessage(null);
    try {
      const response = await fetch('/api/dashboard/pixels/test-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform }),
      });
      const data = await response.json();
      if (data.success) {
        setStatus('success');
      } else {
        setStatus('error');
        setErrorMessage(data.error || 'Unknown error');
      }
    } catch {
      setStatus('error');
      setErrorMessage('Network error');
    }
  }, [platform]);

  if (!isConfigured) return null;

  return (
    <div className='inline-flex items-center gap-2'>
      <Button
        type='button'
        variant='outline'
        size='sm'
        disabled={status === 'loading'}
        onClick={handleTest}
        className='h-7 px-2.5 text-2xs'
      >
        {status === 'loading' ? 'Testing...' : 'Test'}
      </Button>
      {status === 'success' && (
        <span className='text-2xs font-caption text-green-500'>
          Event received
        </span>
      )}
      {status === 'error' && errorMessage && (
        <span className='text-2xs font-caption text-red-500'>
          {errorMessage}
        </span>
      )}
    </div>
  );
}

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

  // Fetch pixel health status
  const { data: healthData } = usePixelHealthQuery({ enabled: isPro });

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
      facebookPixelId: existingSettings?.pixels?.facebookPixelId ?? '',
      googleMeasurementId: existingSettings?.pixels?.googleMeasurementId ?? '',
      tiktokPixelId: existingSettings?.pixels?.tiktokPixelId ?? '',
      enabled: existingSettings?.pixels?.enabled ?? true,
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
      <SettingsPanel
        title='Pixel tracking'
        description='Integrate Facebook, Google, and TikTok conversion tracking pixels.'
      >
        <div className='px-4 py-4 sm:px-5'>
          <SettingsToggleRow
            gated
            title='Enable pixel tracking'
            description='Route fan actions to your Facebook, Google, and TikTok pixels for conversion tracking.'
            gateFeatureContext='Pixel tracking'
          />
        </div>
      </SettingsPanel>
    );
  }

  if (isLoading) {
    return (
      <SettingsPanel
        title='Pixel tracking'
        description='Integrate Facebook, Google, and TikTok conversion tracking pixels.'
      >
        <div className='px-4 py-4 sm:px-5'>
          <PixelsSectionSkeleton />
        </div>
      </SettingsPanel>
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

  return (
    <form onSubmit={handlePixelSubmit} className='space-y-4'>
      <SettingsPanel
        title='Pixel tracking'
        description='Integrate Facebook, Google, and TikTok conversion tracking pixels.'
        actions={
          <div className='flex items-center gap-2'>
            <span className='text-app font-caption tracking-normal text-secondary-token'>
              {pixelData.enabled ? 'Enabled' : 'Disabled'}
            </span>
            <Switch
              checked={pixelData.enabled}
              onCheckedChange={checked => handleInputChange('enabled', checked)}
              aria-label='Enable pixel tracking'
            />
          </div>
        }
      >
        <div className='space-y-3 px-4 py-4 sm:px-5'>
          <ContentSurfaceCard className='bg-surface-0 px-4 py-3.5'>
            <p className='text-app leading-[18px] text-secondary-token'>
              Configure each retargeting destination independently.
            </p>
          </ContentSurfaceCard>

          {healthData && healthData.aggregate.totalEventsThisWeek > 0 && (
            <ContentSurfaceCard className='bg-surface-0 px-4 py-3.5'>
              <p className='text-app font-caption leading-[18px] text-primary-token'>
                {healthData.aggregate.totalEventsThisWeek.toLocaleString()}{' '}
                events forwarded this week &middot;{' '}
                {healthData.aggregate.overallSuccessRate}% success rate
              </p>
            </ContentSurfaceCard>
          )}

          <PlatformSection
            platform='Facebook Conversions API'
            platformKey='facebook'
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
                existingSettings?.pixels?.facebookPixelId &&
                existingSettings?.hasTokens?.facebook
              )
            }
            health={healthData?.platforms.facebook}
            onPixelIdChange={value =>
              handleInputChange('facebookPixelId', value)
            }
            onTokenChange={value =>
              handleInputChange('facebookAccessToken', value)
            }
          />

          <PlatformSection
            platform='Google Analytics 4 (Measurement Protocol)'
            platformKey='google'
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
                existingSettings?.pixels?.googleMeasurementId &&
                existingSettings?.hasTokens?.google
              )
            }
            health={healthData?.platforms.google}
            onPixelIdChange={value =>
              handleInputChange('googleMeasurementId', value)
            }
            onTokenChange={value => handleInputChange('googleApiSecret', value)}
          />

          <PlatformSection
            platform='TikTok Events API'
            platformKey='tiktok'
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
                existingSettings?.pixels?.tiktokPixelId &&
                existingSettings?.hasTokens?.tiktok
              )
            }
            health={healthData?.platforms.tiktok}
            onPixelIdChange={value => handleInputChange('tiktokPixelId', value)}
            onTokenChange={value =>
              handleInputChange('tiktokAccessToken', value)
            }
          />

          <ContentSurfaceCard className='bg-surface-0 px-4 py-3.5'>
            <p className='text-app leading-[18px] text-secondary-token'>
              Events are sent server-side for better accuracy. No third-party
              JavaScript is injected on your profile, and credentials are
              encrypted.
            </p>
          </ContentSurfaceCard>
        </div>
      </SettingsPanel>

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
