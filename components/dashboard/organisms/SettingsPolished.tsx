'use client';

import {
  BellIcon,
  CreditCardIcon,
  PaintBrushIcon,
  PhotoIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useCallback, useState } from 'react';
import { APP_URL } from '@/constants/app';
import { useBillingStatus } from '@/hooks/use-billing-status';
import { cn } from '@/lib/utils';
import type { Artist } from '@/types/db';
import { DashboardCard } from '../atoms/DashboardCard';

interface SettingsPolishedProps {
  artist: Artist;
  onArtistUpdate?: (updatedArtist: Artist) => void;
}

// Apple-style settings navigation - simplified and clean
const settingsNavigation = [
  {
    name: 'Profile',
    id: 'profile',
    icon: UserIcon,
  },
  {
    name: 'Appearance',
    id: 'appearance',
    icon: PaintBrushIcon,
  },
  {
    name: 'Notifications',
    id: 'notifications',
    icon: BellIcon,
  },
  {
    name: 'Remove Branding',
    id: 'remove-branding',
    icon: SparklesIcon,
    isPro: true,
  },
  {
    name: 'Ad Pixels',
    id: 'ad-pixels',
    icon: RocketLaunchIcon,
    isPro: true,
  },
  {
    name: 'Billing',
    id: 'billing',
    icon: CreditCardIcon,
  },
];

export function SettingsPolished({
  artist,
  onArtistUpdate,
}: SettingsPolishedProps) {
  const [currentSection, setCurrentSection] = useState('profile');
  const [isLoading, setIsLoading] = useState(false);
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const billingStatus = useBillingStatus();
  const { isPro } = billingStatus;
  const [isBillingLoading, setIsBillingLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: artist.handle || '',
    displayName: artist.name || '',
  });

  const [marketingEmails, setMarketingEmails] = useState(
    artist.settings?.marketing_emails ?? true
  );
  const [isMarketingSaving, setIsMarketingSaving] = useState(false);

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

  const scrollToSection = (sectionId: string) => {
    setCurrentSection(sectionId);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
        inline: 'nearest',
      });
    }
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

  const handleBilling = async () => {
    if (isBillingLoading) return;

    setIsBillingLoading(true);
    try {
      if (billingStatus.isPro && billingStatus.hasStripeCustomer) {
        const response = await fetch('/api/stripe/portal', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error('Failed to create billing portal session');
        }

        const { url } = await response.json();
        window.location.href = url;
      } else {
        // User doesn't have a subscription - get default Pro plan price ID and redirect to checkout
        try {
          const pricingResponse = await fetch('/api/stripe/pricing-options');
          if (!pricingResponse.ok) {
            throw new Error('Failed to fetch pricing options');
          }

          const { pricingOptions } = await pricingResponse.json();
          // Get the monthly Pro plan (cheapest option for quick upgrade)
          const defaultPlan =
            pricingOptions.find(
              (option: { interval: string }) => option.interval === 'month'
            ) || pricingOptions[0];

          if (!defaultPlan?.priceId) {
            throw new Error('No pricing options available');
          }

          // Create checkout session for the default Pro plan
          const checkoutResponse = await fetch('/api/stripe/checkout', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              priceId: defaultPlan.priceId,
            }),
          });

          if (!checkoutResponse.ok) {
            throw new Error('Failed to create checkout session');
          }

          const { url } = await checkoutResponse.json();
          window.location.href = url;
        } catch (checkoutError) {
          console.error('Error creating checkout session:', checkoutError);
          // Fallback to pricing page
          router.push('/pricing');
        }
      }
    } catch (error) {
      console.error('Error handling billing:', error);
      router.push('/pricing');
    } finally {
      setIsBillingLoading(false);
    }
  };

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoading(true);

      try {
        const response = await fetch('/api/dashboard/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            updates: {
              username: formData.username,
              displayName: formData.displayName,
            },
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to update profile');
        }

        const { profile } = await response.json();

        if (onArtistUpdate) {
          onArtistUpdate({
            ...artist,
            handle: profile.username,
            name: profile.displayName,
          });
        }
      } catch (error) {
        console.error('Failed to update profile:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [formData, artist, onArtistUpdate]
  );

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
    <div className='space-y-6'>
      <form onSubmit={handleSubmit} className='space-y-6'>
        {/* Profile Photo Card */}
        <DashboardCard variant='settings'>
          <div className='flex items-center justify-between mb-4'>
            <h3 className='text-lg font-medium text-primary'>Profile Photo</h3>
          </div>

          <div className='flex items-start space-x-6'>
            <div className='flex-shrink-0'>
              <div className='w-20 h-20 rounded-full bg-surface-2 flex items-center justify-center border-2 border-dashed border-subtle hover:border-accent transition-colors cursor-pointer group'>
                <PhotoIcon className='w-8 h-8 text-secondary group-hover:text-accent-token transition-colors' />
              </div>
            </div>
            <div className='flex-1 space-y-3'>
              <button
                type='button'
                className='inline-flex items-center px-4 py-2 border border-subtle rounded-lg shadow-sm text-sm font-medium text-secondary bg-surface-1 hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 transition-colors'
              >
                <PhotoIcon className='w-4 h-4 mr-2' />
                Upload photo
              </button>
              <p className='text-sm text-secondary'>
                JPG, GIF or PNG. Max size 2MB. Square images work best.
              </p>
            </div>
          </div>
        </DashboardCard>

        {/* Basic Info Card */}
        <DashboardCard variant='settings'>
          <h3 className='text-lg font-medium text-primary mb-6'>
            Basic Information
          </h3>

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
                  <input
                    type='text'
                    name='username'
                    id='username'
                    value={formData.username}
                    onChange={e =>
                      handleInputChange('username', e.target.value)
                    }
                    className='flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-lg border border-subtle bg-surface-1 text-primary placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:border-transparent sm:text-sm transition-colors'
                    placeholder='yourname'
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
              <input
                type='text'
                name='displayName'
                id='displayName'
                value={formData.displayName}
                onChange={e => handleInputChange('displayName', e.target.value)}
                className='block w-full px-3 py-2 border border-subtle rounded-lg bg-surface-1 text-primary placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:border-transparent sm:text-sm shadow-sm transition-colors'
                placeholder='The name your fans will see'
              />
            </div>
          </div>
        </DashboardCard>

        {/* Save Button */}
        <div className='flex justify-end pt-2'>
          <button
            type='submit'
            disabled={isLoading}
            className='inline-flex items-center px-6 py-2.5 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-colors btn-press'
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
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
                'hover:translate-y-[-2px] hover:shadow-lg focus-visible:ring-2 ring-accent focus-visible:outline-none card-hover',
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
              <SparklesIcon className='h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0' />
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
            <input
              type='text'
              id='facebookPixel'
              value={pixelData.facebookPixel}
              onChange={e =>
                handlePixelInputChange('facebookPixel', e.target.value)
              }
              placeholder='1234567890'
              className='block w-full px-3 py-2 border border-subtle rounded-lg bg-surface-1 text-primary placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:border-transparent sm:text-sm shadow-sm transition-colors'
            />
          </div>

          <div>
            <label
              htmlFor='googleAdsConversion'
              className='block text-sm font-medium text-primary mb-2'
            >
              Google Ads Conversion ID
            </label>
            <input
              type='text'
              id='googleAdsConversion'
              value={pixelData.googleAdsConversion}
              onChange={e =>
                handlePixelInputChange('googleAdsConversion', e.target.value)
              }
              placeholder='AW-123456789'
              className='block w-full px-3 py-2 border border-subtle rounded-lg bg-surface-1 text-primary placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:border-transparent sm:text-sm shadow-sm transition-colors'
            />
          </div>

          <div>
            <label
              htmlFor='tiktokPixel'
              className='block text-sm font-medium text-primary mb-2'
            >
              TikTok Pixel ID
            </label>
            <input
              type='text'
              id='tiktokPixel'
              value={pixelData.tiktokPixel}
              onChange={e =>
                handlePixelInputChange('tiktokPixel', e.target.value)
              }
              placeholder='ABCDEF1234567890'
              className='block w-full px-3 py-2 border border-subtle rounded-lg bg-surface-1 text-primary placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:border-transparent sm:text-sm shadow-sm transition-colors'
            />
          </div>

          <div>
            <label
              htmlFor='customPixel'
              className='block text-sm font-medium text-primary mb-2'
            >
              Additional Snippet
            </label>
            <textarea
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
        <button
          type='submit'
          disabled={isPixelSaving}
          className='inline-flex items-center px-6 py-2.5 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-colors btn-press'
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          {isPixelSaving ? 'Saving...' : 'Save Pixels'}
        </button>
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
        <button
          onClick={handleBilling}
          disabled={isBillingLoading || billingStatus.loading}
          className='inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 transition-colors btn-press'
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          {billingStatus.loading
            ? 'Loading...'
            : billingStatus.isPro
              ? 'Open Billing Portal'
              : 'Upgrade to Pro'}
        </button>
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
          <button
            onClick={handleBilling}
            disabled={isBillingLoading || billingStatus.loading}
            className='inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-colors btn-press'
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            {isBillingLoading || billingStatus.loading
              ? 'Loading...'
              : 'Upgrade to Pro'}
          </button>
        </div>
      </DashboardCard>
    );
  };

  return (
    <div className='flex gap-8'>
      {/* Apple-style Navigation Sidebar */}
      <div className='w-64 flex-shrink-0'>
        <div className='sticky top-8'>
          <nav className='space-y-1'>
            {settingsNavigation.map(item => {
              const Icon = item.icon;
              const isActive = currentSection === item.id;
              const isLocked = item.isPro && !isPro;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (isLocked) {
                      scrollToSection('billing');
                    } else {
                      scrollToSection(item.id);
                    }
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-accent text-white shadow-sm'
                      : 'text-primary hover:bg-surface-2',
                    isLocked && 'opacity-60'
                  )}
                >
                  <Icon className='h-5 w-5 flex-shrink-0' />
                  <span className='flex-1'>{item.name}</span>
                  {isLocked && (
                    <ShieldCheckIcon className='h-4 w-4 text-orange-400' />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Single Scrollable Settings Content */}
      <div className='flex-1 min-w-0 max-h-[calc(100vh-6rem)] overflow-y-auto scrollbar-hide'>
        <div className='space-y-8 pb-8'>
          {/* Profile Section */}
          <section id='profile' className='scroll-mt-4'>
            <div className='mb-6'>
              <h1 className='text-2xl font-semibold tracking-tight text-primary'>
                Profile
              </h1>
              <p className='mt-1 text-sm text-secondary'>
                Manage your public profile and account details.
              </p>
            </div>
            {renderProfileSection()}
          </section>

          {/* Appearance Section */}
          <section id='appearance' className='scroll-mt-4'>
            <div className='mb-6'>
              <h1 className='text-2xl font-semibold tracking-tight text-primary'>
                Appearance
              </h1>
              <p className='mt-1 text-sm text-secondary'>
                Customize how the interface looks and feels.
              </p>
            </div>
            {renderAppearanceSection()}
          </section>

          {/* Notifications Section */}
          <section id='notifications' className='scroll-mt-4'>
            <div className='mb-6'>
              <h1 className='text-2xl font-semibold tracking-tight text-primary'>
                Notifications
              </h1>
              <p className='mt-1 text-sm text-secondary'>
                Manage your email preferences and communication settings.
              </p>
            </div>
            {renderNotificationsSection()}
          </section>

          {/* Pro Features */}
          <section id='remove-branding' className='scroll-mt-4'>
            <div className='mb-6'>
              <h1 className='text-2xl font-semibold tracking-tight text-primary'>
                Remove Branding
              </h1>
              <p className='mt-1 text-sm text-secondary'>
                Hide Jovie branding from your profile for a professional look.
              </p>
            </div>
            {isPro
              ? renderRemoveBrandingSection()
              : renderProUpgradeCard(
                  'Professional Appearance',
                  'Remove Jovie branding to create a fully custom experience for your fans.',
                  SparklesIcon
                )}
          </section>

          <section id='ad-pixels' className='scroll-mt-4'>
            <div className='mb-6'>
              <h1 className='text-2xl font-semibold tracking-tight text-primary'>
                Ad Pixels
              </h1>
              <p className='mt-1 text-sm text-secondary'>
                Connect Facebook, Google, and TikTok pixels to track
                conversions.
              </p>
            </div>
            {isPro
              ? renderAdPixelsSection()
              : renderProUpgradeCard(
                  'Unlock Growth Tracking',
                  'Seamlessly integrate Facebook, Google, and TikTok pixels.',
                  RocketLaunchIcon
                )}
          </section>

          {/* Billing Section */}
          <section id='billing' className='scroll-mt-4'>
            <div className='mb-6'>
              <h1 className='text-2xl font-semibold tracking-tight text-primary'>
                Billing & Subscription
              </h1>
              <p className='mt-1 text-sm text-secondary'>
                Manage your subscription, payment methods, and billing history.
              </p>
            </div>
            {renderBillingSection()}
          </section>
        </div>
      </div>
    </div>
  );
}
