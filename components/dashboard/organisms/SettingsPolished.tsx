'use client';

import {
  CreditCardIcon,
  RocketLaunchIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@jovie/ui';
import { useFeatureGate } from '@statsig/react-bindings';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useCallback, useState } from 'react';
import { Input } from '@/components/atoms/Input';
import { Textarea } from '@/components/atoms/Textarea';
import { AccountSettingsSection } from '@/components/dashboard/organisms/AccountSettingsSection';
import { useToast } from '@/components/molecules/ToastContainer';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import { APP_URL } from '@/constants/app';
import { useBillingStatus } from '@/hooks/use-billing-status';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '@/lib/images/config';
import { STATSIG_FLAGS } from '@/lib/statsig/flags';
import { cn } from '@/lib/utils';
import type { Artist } from '@/types/db';
import { DashboardCard } from '../atoms/DashboardCard';

interface SettingsPolishedProps {
  artist: Artist;
  onArtistUpdate?: (updatedArtist: Artist) => void;
  focusSection?: string;
}

// Use Geist button styling directly; keep layout helper only.
const SETTINGS_BUTTON_CLASS = 'w-full sm:w-auto';

export function SettingsPolished({
  artist,
  onArtistUpdate,
  focusSection,
}: SettingsPolishedProps) {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const billingStatus = useBillingStatus();
  const { isPro } = billingStatus;
  const [isBillingLoading, setIsBillingLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: artist.handle || '',
    displayName: artist.name || '',
  });

  const [marketingEmails, setMarketingEmails] = useState(true); // Default to true, should be loaded from user preferences
  const [isMarketingSaving, setIsMarketingSaving] = useState(false);

  const notificationsGate = useFeatureGate(STATSIG_FLAGS.NOTIFICATIONS);
  const notificationsEnabled = notificationsGate.value;

  const [pixelData, setPixelData] = useState({
    facebookPixel: '',
    googleAdsConversion: '',
    tiktokPixel: '',
    customPixel: '',
  });
  const [isPixelSaving, setIsPixelSaving] = useState(false);

  // State for branding removal toggle
  const [hideBranding, setHideBranding] = useState(
    artist.settings?.hide_branding ?? false
  );
  const [isSavingBranding, setIsSavingBranding] = useState(false);
  const { showToast } = useToast();
  const maxAvatarSize = AVATAR_MAX_FILE_SIZE_BYTES;
  const acceptedAvatarTypes = SUPPORTED_IMAGE_MIME_TYPES;

  const handleAvatarUpload = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/images/upload', {
      method: 'POST',
      body: formData,
    });

    const data = (await response.json().catch(() => ({}))) as {
      blobUrl?: string;
      error?: string;
      code?: string;
      retryable?: boolean;
    };

    if (!response.ok) {
      // Throw structured error for AvatarUploadable to handle
      const error = new Error(data.error || 'Upload failed') as Error & {
        code?: string;
        retryable?: boolean;
      };
      error.code = data.code;
      error.retryable = data.retryable;
      throw error;
    }

    if (!data.blobUrl) {
      throw new Error('No image URL returned from upload');
    }

    return data.blobUrl;
  }, []);

  const handleAvatarUpdate = useCallback(
    async (imageUrl: string) => {
      const previousImage = artist.image_url;

      try {
        const response = await fetch('/api/dashboard/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            updates: {
              avatarUrl: imageUrl,
            },
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            (data as { error?: string }).error ||
              'Failed to update profile photo'
          );
        }

        const profile = (data as { profile?: { avatarUrl?: string } }).profile;
        const warning = (data as { warning?: string }).warning;

        if (onArtistUpdate) {
          onArtistUpdate({
            ...artist,
            image_url: profile?.avatarUrl ?? imageUrl,
          });
        }

        // Show warning if Clerk sync failed but don't treat as error
        if (warning) {
          showToast({ type: 'warning', message: warning });
        }
      } catch (error) {
        if (onArtistUpdate) {
          onArtistUpdate({
            ...artist,
            image_url: previousImage,
          });
        }

        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Failed to update profile photo';
        showToast({ type: 'error', message });
      }
    },
    [artist, onArtistUpdate, showToast]
  );

  const handleBrandingToggle = useCallback(
    async (enabled: boolean) => {
      setIsSavingBranding(true);
      try {
        const response = await fetch('/api/dashboard/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            updates: {
              settings: {
                hide_branding: enabled,
              },
            },
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to update branding settings');
        }

        setHideBranding(enabled);

        if (onArtistUpdate) {
          onArtistUpdate({
            ...artist,
            settings: {
              ...artist.settings,
              hide_branding: enabled,
            },
          });
        }
      } catch (error) {
        console.error('Failed to update branding settings:', error);
        // Revert the toggle on error
        setHideBranding(!enabled);
      } finally {
        setIsSavingBranding(false);
      }
    },
    [artist, onArtistUpdate]
  );

  const handleBilling = async () => {
    setIsBillingLoading(true);
    await router.push('/settings/billing');
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePixelInputChange = (field: string, value: string) => {
    setPixelData(prev => ({ ...prev, [field]: value }));
  };

  const handleThemeChange = async (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);

    try {
      // Save theme preference to database for signed-in users
      const response = await fetch('/api/dashboard/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          updates: {
            theme: { preference: newTheme },
          },
        }),
      });

      if (!response.ok) {
        console.error('Failed to save theme preference');
      }
    } catch (error) {
      console.error('Error saving theme preference:', error);
    }
  };

  const handleMarketingToggle = useCallback(async (enabled: boolean) => {
    setIsMarketingSaving(true);
    try {
      const response = await fetch('/api/dashboard/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          updates: {
            settings: {
              marketing_emails: enabled,
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update marketing preferences');
      }

      setMarketingEmails(enabled);
    } catch (error) {
      console.error('Failed to update marketing preferences:', error);
      setMarketingEmails(!enabled);
    } finally {
      setIsMarketingSaving(false);
    }
  }, []);

  const handlePixelSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsPixelSaving(true);

      try {
        const response = await fetch('/api/dashboard/pixels', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            facebookPixel: pixelData.facebookPixel,
            googleAdsConversion: pixelData.googleAdsConversion,
            tiktokPixel: pixelData.tiktokPixel,
            customPixel: pixelData.customPixel,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to save pixels');
        }

        // Optionally show success message or handle response
        console.log('Pixels saved successfully');
      } catch (error) {
        console.error('Failed to save pixels:', error);
        // Optionally show error message to user
      } finally {
        setIsPixelSaving(false);
      }
    },
    [pixelData]
  );

  const appDomain = APP_URL.replace(/^https?:\/\//, '');

  const renderProfileSection = () => (
    <DashboardCard variant='settings'>
      <div className='flex flex-col gap-6'>
        <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <h3 className='text-lg font-medium text-primary mb-2'>
              Profile Photo
            </h3>
          </div>
        </div>

        <div className='flex flex-col items-center justify-center gap-4'>
          <div className='w-48 h-48'>
            <AvatarUploadable
              src={artist.image_url}
              alt={artist.name || 'Profile photo'}
              name={artist.name || artist.handle}
              size='display-xl'
              uploadable
              showHoverOverlay
              onUpload={handleAvatarUpload}
              onSuccess={handleAvatarUpdate}
              onError={message => showToast({ type: 'error', message })}
              maxFileSize={maxAvatarSize}
              acceptedTypes={acceptedAvatarTypes}
              className='mx-auto animate-in fade-in duration-300'
            />
          </div>
          <p className='text-sm text-secondary text-center'>
            Drag & drop or click to upload. Watch the ring animation for status.
          </p>
        </div>

        <div className='space-y-6'>
          {/* Username */}
          <div>
            <label
              htmlFor='username'
              className='block text-sm font-medium text-primary mb-2'
            >
              Username
            </label>
            <div className='relative'>
              <div className='flex rounded-lg shadow-sm'>
                <span className='inline-flex items-center px-3 rounded-l-lg border border-r-0 border-subtle bg-surface-2 text-secondary text-sm select-none'>
                  {appDomain}/
                </span>
                <Input
                  type='text'
                  name='username'
                  id='username'
                  value={formData.username}
                  onChange={e => handleInputChange('username', e.target.value)}
                  placeholder='yourname'
                  className='flex-1 min-w-0'
                  inputClassName='block w-full px-3 py-2 rounded-none rounded-r-lg border border-subtle bg-surface-1 text-primary placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:border-transparent sm:text-sm transition-colors'
                />
              </div>
            </div>
          </div>

          {/* Display Name */}
          <div>
            <label
              htmlFor='displayName'
              className='block text-sm font-medium text-primary mb-2'
            >
              Display Name
            </label>
            <Input
              type='text'
              name='displayName'
              id='displayName'
              value={formData.displayName}
              onChange={e => handleInputChange('displayName', e.target.value)}
              placeholder='The name your fans will see'
              inputClassName='block w-full px-3 py-2 border border-subtle rounded-lg bg-surface-1 text-primary placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:border-transparent sm:text-sm shadow-sm transition-colors'
            />
          </div>
        </div>
      </div>
    </DashboardCard>
  );

  const renderAccountSection = () => (
    <div className='space-y-6'>
      {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
        <AccountSettingsSection />
      ) : (
        <DashboardCard variant='settings'>
          <div className='text-center py-4'>
            <h3 className='text-lg font-medium text-primary mb-2'>
              Account settings unavailable
            </h3>
            <p className='text-sm text-secondary'>
              Clerk is not configured (missing publishable key). Set
              NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to enable account management.
            </p>
          </div>
        </DashboardCard>
      )}
    </div>
  );

  const renderAppearanceSection = () => (
    <div>
      <DashboardCard variant='settings' className='space-y-4'>
        <h3 className='text-lg font-medium text-primary mb-6'>
          Interface Theme
        </h3>

        <div className='grid grid-cols-3 gap-4'>
          {[
            {
              value: 'light',
              label: 'Light',
              description: 'Bright and clean.',
              preview: {
                bg: 'bg-white',
                sidebar: 'bg-gray-50',
                accent: 'bg-gray-100',
              },
            },
            {
              value: 'dark',
              label: 'Dark',
              description: 'Bold and focused.',
              preview: {
                bg: 'bg-gray-900',
                sidebar: 'bg-gray-800',
                accent: 'bg-gray-700',
              },
            },
            {
              value: 'system',
              label: 'System',
              description: 'Match device settings.',
              preview: {
                bg: 'bg-gradient-to-br from-white to-gray-900',
                sidebar: 'bg-gradient-to-br from-gray-50 to-gray-800',
                accent: 'bg-gradient-to-br from-gray-100 to-gray-700',
              },
            },
          ].map(option => (
            <button
              key={option.value}
              onClick={() =>
                handleThemeChange(option.value as 'light' | 'dark' | 'system')
              }
              className={cn(
                'group relative flex flex-col p-4 rounded-xl border-2 transition-all duration-300 ease-in-out',
                'hover:translate-y-[-2px] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1',
                theme === option.value
                  ? 'border-accent/70 bg-surface-2'
                  : 'border-subtle hover:border-accent/50'
              )}
            >
              {/* Miniature Dashboard Preview */}
              <div className='relative w-full h-20 rounded-lg overflow-hidden mb-3'>
                <div className={`w-full h-full ${option.preview.bg}`}>
                  {/* Sidebar */}
                  <div
                    className={`absolute left-0 top-0 w-6 h-full ${option.preview.sidebar} rounded-r`}
                  />
                  {/* Content area with some mock elements */}
                  <div className='absolute left-8 top-2 right-2 bottom-2 space-y-1'>
                    <div
                      className={`h-2 ${option.preview.accent} rounded w-1/3`}
                    />
                    <div
                      className={`h-1.5 ${option.preview.accent} rounded w-1/2 opacity-60`}
                    />
                    <div
                      className={`h-1.5 ${option.preview.accent} rounded w-2/3 opacity-40`}
                    />
                  </div>
                </div>
              </div>

              {/* Option Info */}
              <div className='text-left'>
                <h4 className='font-medium text-primary text-sm mb-1'>
                  {option.label}
                </h4>
                <p className='text-xs text-secondary mt-1'>
                  {option.description}
                </p>
              </div>

              {/* Animated Checkmark Overlay */}
              {theme === option.value && (
                <div className='absolute top-2 right-2 w-5 h-5 bg-accent-token rounded-full flex items-center justify-center animate-in zoom-in-95 fade-in duration-200'>
                  <svg
                    className='w-3 h-3 text-white'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={3}
                      d='M5 13l4 4L19 7'
                    />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>

        <p className='text-xs text-secondary mt-4'>
          Choose how the interface appears. System automatically matches your
          device settings.
        </p>
      </DashboardCard>
    </div>
  );

  const renderRemoveBrandingSection = () => {
    return (
      <DashboardCard variant='settings'>
        <div className='flex items-start justify-between'>
          <div className='flex-1'>
            <h3 className='text-lg font-medium text-primary mb-2'>
              Hide Jovie Branding
            </h3>
            <p className='text-sm text-secondary max-w-md'>
              When enabled, Jovie branding will be removed from your profile
              page, giving your fans a fully custom experience.
            </p>
          </div>

          <div className='ml-6'>
            <button
              type='button'
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
                hideBranding ? 'bg-accent' : 'bg-surface-3',
                isSavingBranding && 'opacity-50 cursor-not-allowed'
              )}
              onClick={() => handleBrandingToggle(!hideBranding)}
              disabled={isSavingBranding}
              role='switch'
              aria-checked={hideBranding}
              aria-label='Hide Jovie branding'
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                  hideBranding ? 'translate-x-6' : 'translate-x-1'
                )}
              />
            </button>
          </div>
        </div>

        {hideBranding && (
          <div className='mt-4 p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg'>
            <div className='flex items-start gap-3'>
              <SparklesIcon className='h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0' />
              <div>
                <p className='text-sm font-medium text-green-800 dark:text-green-200'>
                  Branding Hidden
                </p>
                <p className='text-xs text-green-600 dark:text-green-400 mt-1'>
                  Your profile now shows a completely custom experience without
                  Jovie branding.
                </p>
              </div>
            </div>
          </div>
        )}
      </DashboardCard>
    );
  };

  const renderAdPixelsSection = () => (
    <form onSubmit={handlePixelSubmit} className='space-y-6'>
      <DashboardCard variant='settings'>
        <h3 className='text-lg font-medium text-primary mb-6'>Pixel IDs</h3>

        <div className='space-y-6'>
          <div>
            <label
              htmlFor='facebookPixel'
              className='block text-sm font-medium text-primary mb-2'
            >
              Facebook Pixel ID
            </label>
            <Input
              type='text'
              id='facebookPixel'
              value={pixelData.facebookPixel}
              onChange={e =>
                handlePixelInputChange('facebookPixel', e.target.value)
              }
              placeholder='1234567890'
              inputClassName='block w-full px-3 py-2 border border-subtle rounded-lg bg-surface-1 text-primary placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:border-transparent sm:text-sm shadow-sm transition-colors'
            />
          </div>

          <div>
            <label
              htmlFor='googleAdsConversion'
              className='block text-sm font-medium text-primary mb-2'
            >
              Google Ads Conversion ID
            </label>
            <Input
              type='text'
              id='googleAdsConversion'
              value={pixelData.googleAdsConversion}
              onChange={e =>
                handlePixelInputChange('googleAdsConversion', e.target.value)
              }
              placeholder='AW-123456789'
              inputClassName='block w-full px-3 py-2 border border-subtle rounded-lg bg-surface-1 text-primary placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:border-transparent sm:text-sm shadow-sm transition-colors'
            />
          </div>

          <div>
            <label
              htmlFor='tiktokPixel'
              className='block text-sm font-medium text-primary mb-2'
            >
              TikTok Pixel ID
            </label>
            <Input
              type='text'
              id='tiktokPixel'
              value={pixelData.tiktokPixel}
              onChange={e =>
                handlePixelInputChange('tiktokPixel', e.target.value)
              }
              placeholder='ABCDEF1234567890'
              inputClassName='block w-full px-3 py-2 border border-subtle rounded-lg bg-surface-1 text-primary placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:border-transparent sm:text-sm shadow-sm transition-colors'
            />
          </div>

          <div>
            <label
              htmlFor='customPixel'
              className='block text-sm font-medium text-primary mb-2'
            >
              Additional Snippet
            </label>
            <Textarea
              id='customPixel'
              rows={4}
              value={pixelData.customPixel}
              onChange={e =>
                handlePixelInputChange('customPixel', e.target.value)
              }
              placeholder='<script>/* your tag */</script>'
              className='block w-full px-3 py-2 border border-subtle rounded-lg bg-surface-1 text-primary placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:border-transparent sm:text-sm shadow-sm resize-none transition-colors'
            />
            <p className='mt-2 text-sm text-secondary'>
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

  const renderNotificationsSection = () => (
    <DashboardCard variant='settings'>
      <div className='flex items-start justify-between'>
        <div className='flex-1'>
          <h3 className='text-lg font-medium text-primary mb-2'>
            Marketing Emails
          </h3>
          <p className='text-sm text-secondary max-w-md'>
            Receive updates about new features, tips, and promotional offers
            from Jovie.
          </p>
        </div>

        <div className='ml-6'>
          <button
            type='button'
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
              marketingEmails ? 'bg-accent' : 'bg-surface-3',
              isMarketingSaving && 'opacity-50 cursor-not-allowed'
            )}
            onClick={() => handleMarketingToggle(!marketingEmails)}
            disabled={isMarketingSaving}
            role='switch'
            aria-checked={marketingEmails}
            aria-label='Toggle marketing emails'
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                marketingEmails ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>
      </div>
    </DashboardCard>
  );

  const renderBillingSection = () => (
    <DashboardCard variant='settings'>
      <div className='text-center py-4'>
        <CreditCardIcon className='mx-auto h-12 w-12 text-secondary mb-4' />
        <h3 className='text-lg font-medium text-primary mb-2'>
          Manage your plan
        </h3>
        <p className='text-sm text-secondary mb-4'>
          Update payment details, change plans, or view invoices.
        </p>
        <Button
          onClick={handleBilling}
          loading={isBillingLoading || billingStatus.loading}
          className={SETTINGS_BUTTON_CLASS}
          variant='primary'
        >
          {billingStatus.isPro ? 'Open Billing Portal' : 'Upgrade to Pro'}
        </Button>
      </div>
    </DashboardCard>
  );

  const renderProUpgradeCard = (
    title: string,
    description: string,
    icon: React.ComponentType<{ className?: string }>
  ) => {
    const Icon = icon;
    return (
      <DashboardCard variant='settings'>
        <div className='text-center py-4'>
          <Icon className='mx-auto h-12 w-12 text-secondary mb-4' />
          <h3 className='text-lg font-medium text-primary mb-2'>{title}</h3>
          <p className='text-sm text-secondary mb-4'>{description}</p>
          <Button
            onClick={handleBilling}
            loading={isBillingLoading || billingStatus.loading}
            className={SETTINGS_BUTTON_CLASS}
            variant='primary'
          >
            Upgrade to Pro
          </Button>
        </div>
      </DashboardCard>
    );
  };

  const sections = [
    {
      id: 'profile',
      title: 'Profile',
      description: 'Manage your public profile and account details.',
      render: renderProfileSection,
    },
    {
      id: 'account',
      title: 'Account',
      description:
        'Manage email addresses, password, connected accounts, and more.',
      render: renderAccountSection,
    },
    {
      id: 'appearance',
      title: 'Appearance',
      description: 'Customize how the interface looks and feels.',
      render: renderAppearanceSection,
    },
    {
      id: 'notifications',
      title: 'Notifications',
      description: 'Manage your email preferences and communication settings.',
      render: () =>
        notificationsEnabled ? (
          renderNotificationsSection()
        ) : (
          <DashboardCard variant='settings'>
            <div className='text-center py-4'>
              <h3 className='text-lg font-medium text-primary mb-2'>
                Notifications are not available yet
              </h3>
              <p className='text-sm text-secondary'>
                We&apos;re focused on getting the core Jovie profile experience
                right before launching notifications.
              </p>
            </div>
          </DashboardCard>
        ),
    },
    {
      id: 'remove-branding',
      title: 'Remove Branding',
      description:
        'Remove Jovie branding to create a fully custom experience for your fans.',
      render: () =>
        isPro
          ? renderRemoveBrandingSection()
          : renderProUpgradeCard(
              'Professional Appearance',
              'Remove Jovie branding to create a fully custom experience for your fans.',
              SparklesIcon
            ),
    },
    {
      id: 'ad-pixels',
      title: 'Ad Pixels',
      description:
        'Connect Facebook, Google, and TikTok pixels to track conversions.',
      render: () =>
        isPro
          ? renderAdPixelsSection()
          : renderProUpgradeCard(
              'Unlock Growth Tracking',
              'Seamlessly integrate Facebook, Google, and TikTok pixels.',
              RocketLaunchIcon
            ),
    },
    {
      id: 'billing',
      title: 'Billing & Subscription',
      description:
        'Manage your subscription, payment methods, and billing history.',
      render: renderBillingSection,
    },
  ];

  const visibleSections = focusSection
    ? sections.filter(section => section.id === focusSection)
    : sections;

  return (
    <div className='space-y-8 pb-8'>
      {visibleSections.map(section => (
        <section id={section.id} key={section.id} className='scroll-mt-4'>
          <div className='mb-6'>
            <h1 className='text-2xl font-semibold tracking-tight text-primary'>
              {section.title}
            </h1>
            <p className='mt-1 text-sm text-secondary'>{section.description}</p>
          </div>
          {section.render()}
        </section>
      ))}
    </div>
  );
}
