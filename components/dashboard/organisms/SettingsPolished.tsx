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

// Organized settings with proper hierarchy
const coreSettingsNavigation = [
  {
    name: 'Profile',
    id: 'profile',
    icon: UserIcon,
    description: 'Your identity and presence',
    subsections: [
      { name: 'Display Name', id: 'profile-name' },
      { name: 'Bio & Description', id: 'profile-bio' },
      { name: 'Profile Photo', id: 'profile-photo' },
    ],
  },
  {
    name: 'Appearance',
    id: 'appearance',
    icon: PaintBrushIcon,
    description: 'Theme and visual preferences',
    subsections: [
      { name: 'Color Theme', id: 'appearance-theme' },
      { name: 'Layout Preferences', id: 'appearance-layout' },
    ],
  },
  {
    name: 'Links & Notifications',
    id: 'links-notifications',
    icon: BellIcon,
    description: 'Manage your connections',
    subsections: [
      { name: 'Link Organization', id: 'links-org' },
      { name: 'Email Updates', id: 'notifications-email' },
    ],
  },
];

const proSettingsNavigation = [
  {
    name: 'Privacy & Security',
    id: 'privacy',
    icon: ShieldCheckIcon,
    description: 'Advanced privacy controls',
    subsections: [
      { name: 'Profile Visibility', id: 'privacy-visibility' },
      { name: 'Data Controls', id: 'privacy-data' },
      { name: 'Analytics Privacy', id: 'privacy-analytics' },
    ],
  },
  {
    name: 'Advanced Features',
    id: 'advanced',
    icon: SparklesIcon,
    description: 'Pro-only capabilities',
    subsections: [
      { name: 'Custom Branding', id: 'advanced-branding' },
      { name: 'Analytics Dashboard', id: 'advanced-analytics' },
      { name: 'Priority Support', id: 'advanced-support' },
    ],
  },
  {
    name: 'Ad Pixels',
    id: 'ad-pixels',
    icon: RocketLaunchIcon,
    description: 'Drop in ad network tags',
    subsections: [],
  },
];

const billingNavigation = [
  {
    name: 'Billing',
    id: 'billing',
    icon: CreditCardIcon,
    description: 'Subscription and payments',
    subsections: [
      { name: 'Current Plan', id: 'billing-plan' },
      { name: 'Payment Methods', id: 'billing-payment' },
      { name: 'Billing History', id: 'billing-history' },
    ],
  },
];

export function SettingsPolished({
  artist,
  onArtistUpdate,
}: SettingsPolishedProps) {
  const [currentSection, setCurrentSection] = useState('profile');
  const [isLoading, setIsLoading] = useState(false);
  const { theme, setTheme } = useTheme();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['profile'])
  );
  const router = useRouter();
  const billingStatus = useBillingStatus();
  const { isPro } = billingStatus;
  const [isBillingLoading, setIsBillingLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: artist.handle || '',
    displayName: artist.name || '',
    bio: artist.tagline || '',
    creatorType: 'artist',
  });

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
        router.push('/pricing');
      }
    } catch (error) {
      console.error('Error opening billing portal:', error);
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
              bio: formData.bio,
              creatorType: formData.creatorType,
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
            tagline: profile.bio,
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

  const appDomain = APP_URL.replace(/^https?:\/\//, '');

  const renderProfileSection = () => (
    <div className='space-y-8'>
      {/* Header */}
      <div className='pb-6 border-b border-subtle'>
        <h1 className='text-2xl font-semibold tracking-tight text-primary'>
          Your Profile
        </h1>
        <p className='mt-2 text-sm text-secondary'>
          This information will be displayed publicly so be mindful what you
          share.
        </p>
      </div>

      <form onSubmit={handleSubmit} className='space-y-8'>
        {/* Profile Photo Card */}
        <DashboardCard variant='settings'>
          <div className='flex items-center justify-between mb-4'>
            <h3 className='text-lg font-medium text-primary'>Profile Photo</h3>
            <span className='inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-surface-2 text-secondary border border-subtle'>
              <SparklesIcon className='w-3 h-3 mr-1' />
              Pro
            </span>
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

            {/* Bio */}
            <div>
              <label
                htmlFor='bio'
                className='block text-sm font-medium text-primary mb-2'
              >
                Bio
              </label>
              <textarea
                name='bio'
                id='bio'
                rows={4}
                value={formData.bio}
                onChange={e => handleInputChange('bio', e.target.value)}
                className='block w-full px-3 py-2 border border-subtle rounded-lg bg-surface-1 text-primary placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:border-transparent sm:text-sm shadow-sm resize-none transition-colors'
                placeholder='Tell your fans about yourself...'
              />
              <p className='mt-2 text-sm text-secondary'>
                A few sentences about your music and what makes you unique.
              </p>
            </div>

            {/* Creator Type */}
            <div>
              <label
                htmlFor='creatorType'
                className='block text-sm font-medium text-primary mb-2'
              >
                Creator Type
              </label>
              <select
                id='creatorType'
                name='creatorType'
                value={formData.creatorType}
                onChange={e => handleInputChange('creatorType', e.target.value)}
                className='block w-full px-3 py-2 border border-subtle rounded-lg bg-surface-1 text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:border-transparent sm:text-sm shadow-sm transition-colors'
              >
                <option value='artist'>Solo Artist</option>
                <option value='band'>Band</option>
                <option value='podcaster'>Podcaster</option>
                <option value='creator'>Content Creator</option>
              </select>
            </div>
          </div>
        </DashboardCard>

        {/* Save Button */}
        <div className='flex justify-end pt-4 border-t border-subtle'>
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
    <div className='space-y-8'>
      {/* Apple-styled header */}
      <div className='mb-8'>
        <h1 className='text-[22px] font-semibold tracking-[-0.01em] text-primary'>
          Appearance
        </h1>
        <p className='text-sm text-secondary mt-1'>
          Customize how the interface looks and feels.
        </p>
      </div>

      {/* Theme Selection Card */}
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

  const renderAdPixelsSection = () => (
    <div className='space-y-8'>
      <div className='pb-6 border-b border-subtle'>
        <h1 className='text-2xl font-semibold tracking-tight text-primary'>
          Ad Pixels
        </h1>
        <p className='mt-2 text-sm text-secondary'>
          Connect Facebook, Google, and TikTok pixels to track every fan
          conversion.
        </p>
      </div>

      <form onSubmit={e => e.preventDefault()} className='space-y-8'>
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
                placeholder='<script>/* your tag */</script>'
                className='block w-full px-3 py-2 border border-subtle rounded-lg bg-surface-1 text-primary placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:border-transparent sm:text-sm shadow-sm resize-none transition-colors'
              />
              <p className='mt-2 text-sm text-secondary'>
                For other ad networks or tag managers.
              </p>
            </div>
          </div>
        </DashboardCard>

        <div className='flex justify-end pt-4 border-t border-subtle'>
          <button
            type='submit'
            className='inline-flex items-center px-6 py-2.5 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 transition-colors btn-press'
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            Save Pixels
          </button>
        </div>
      </form>
    </div>
  );

  const renderContent = () => {
    switch (currentSection) {
      case 'profile':
        return renderProfileSection();
      case 'appearance':
        return renderAppearanceSection();
      case 'notifications':
        return (
          <div className='space-y-8'>
            <div className='pb-6 border-b border-subtle'>
              <h1 className='text-2xl font-semibold tracking-tight text-primary'>
                Notifications
              </h1>
              <p className='mt-2 text-sm text-secondary'>
                Stay informed about your profile activity.
              </p>
            </div>
            <div className='bg-surface-1 rounded-xl border border-subtle p-8 shadow-sm text-center'>
              <BellIcon className='mx-auto h-12 w-12 text-secondary mb-4' />
              <h3 className='text-lg font-medium text-primary mb-2'>
                Notification settings coming soon
              </h3>
              <p className='text-sm text-secondary'>
                We&apos;re working on giving you more control over your
                notifications.
              </p>
            </div>
          </div>
        );
      case 'privacy':
        return (
          <div className='space-y-8'>
            <div className='pb-6 border-b border-subtle'>
              <h1 className='text-2xl font-semibold tracking-tight text-primary'>
                Privacy & Security
              </h1>
              <p className='mt-2 text-sm text-secondary'>
                Control your profile visibility and data.
              </p>
            </div>
            <div className='bg-surface-1 rounded-xl border border-subtle p-8 shadow-sm text-center'>
              <ShieldCheckIcon className='mx-auto h-12 w-12 text-secondary mb-4' />
              <h3 className='text-lg font-medium text-primary mb-2'>
                Privacy settings coming soon
              </h3>
              <p className='text-sm text-secondary'>
                Advanced privacy controls and security settings are in
                development.
              </p>
            </div>
          </div>
        );
      case 'ad-pixels':
        if (!isPro) {
          return (
            <div className='space-y-8'>
              <div className='pb-6 border-b border-subtle'>
                <h1 className='text-2xl font-semibold tracking-tight text-primary'>
                  Ad Pixels
                </h1>
                <p className='mt-2 text-sm text-secondary'>
                  Upgrade to Pro to add ad network pixels.
                </p>
              </div>
              <div className='bg-surface-1 rounded-xl border border-subtle p-8 shadow-sm text-center'>
                <RocketLaunchIcon className='mx-auto h-12 w-12 text-secondary mb-4' />
                <h3 className='text-lg font-medium text-primary mb-2'>
                  Unlock growth tracking
                </h3>
                <p className='text-sm text-secondary mb-4'>
                  Seamlessly integrate Facebook, Google, and TikTok pixels.
                </p>
                <button
                  className='inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 transition-colors btn-press'
                  style={{ backgroundColor: 'var(--color-accent)' }}
                >
                  Upgrade to Pro
                </button>
              </div>
            </div>
          );
        }
        return renderAdPixelsSection();
      case 'billing':
        return (
          <div className='space-y-8'>
            <div className='pb-6 border-b border-subtle'>
              <h1 className='text-2xl font-semibold tracking-tight text-primary'>
                Billing & Subscription
              </h1>
              <p className='mt-2 text-sm text-secondary'>
                Manage your subscription and billing details.
              </p>
            </div>
            <div className='bg-surface-1 rounded-xl border border-subtle p-8 shadow-sm text-center'>
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
          </div>
        );
      default:
        return null;
    }
  };

  const renderSettingsGroup = (
    title: string,
    items: typeof coreSettingsNavigation,
    showLockIcon = false
  ) => (
    <div className='space-y-1'>
      <div className='flex items-center gap-2 px-3 py-2'>
        <h4 className='text-xs font-semibold text-secondary uppercase tracking-wider'>
          {title}
        </h4>
        {showLockIcon && (
          <div className='group relative'>
            <ShieldCheckIcon className='h-4 w-4 text-orange-500' />
            <div className='absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap'>
              Upgrade to unlock
            </div>
          </div>
        )}
      </div>

      {items.map(item => {
        const isExpanded = expandedSections.has(item.id);
        const Icon = item.icon;

        return (
          <div key={item.id} className='space-y-1'>
            <button
              onClick={() => {
                if (showLockIcon && !isPro) {
                  // Show upgrade modal or redirect
                  return;
                }
                toggleSection(item.id);
                setCurrentSection(item.id);
              }}
              className={cn(
                'w-full group flex items-center justify-between p-3 text-left rounded-lg transition-all duration-200',
                currentSection === item.id
                  ? 'bg-surface-2 text-primary shadow-sm border border-accent/20'
                  : 'text-secondary hover:text-primary hover:bg-surface-1',
                showLockIcon && !isPro && 'opacity-60 cursor-not-allowed'
              )}
              disabled={showLockIcon && !isPro}
            >
              <div className='flex items-center gap-3 flex-1'>
                <Icon className='h-5 w-5 flex-shrink-0' />
                <div className='flex-1'>
                  <div className='flex items-center gap-2'>
                    <span className='font-medium text-sm'>{item.name}</span>
                    {showLockIcon && !isPro && (
                      <ShieldCheckIcon className='h-3 w-3 text-orange-500' />
                    )}
                  </div>
                  <div className='text-xs text-secondary mt-0.5'>
                    {item.description}
                  </div>
                </div>
              </div>

              <svg
                className={cn(
                  'h-4 w-4 text-secondary transition-transform duration-200',
                  isExpanded && 'transform rotate-180'
                )}
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M19 9l-7 7-7-7'
                />
              </svg>
            </button>

            {/* Collapsible Subsections */}
            {isExpanded && item.subsections && (
              <div className='ml-8 space-y-1 pb-2'>
                {item.subsections.map(subsection => (
                  <button
                    key={subsection.id}
                    onClick={() => {
                      // Switch current section group if needed, then smooth-scroll to the anchor
                      setCurrentSection(subsection.id);
                      // Allow the DOM to render the section content before scrolling
                      setTimeout(() => {
                        const el = document.getElementById(subsection.id);
                        if (el) {
                          el.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start',
                          });
                        }
                      }, 0);
                    }}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded text-sm transition-colors',
                      currentSection === subsection.id
                        ? 'bg-accent/10 text-accent-token font-medium'
                        : 'text-secondary hover:text-primary hover:bg-surface-1'
                    )}
                  >
                    {subsection.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className='flex gap-8'>
      {/* Enhanced Settings Navigation */}
      <div className='w-72 flex-shrink-0'>
        <div className='sticky top-8 space-y-6'>
          <nav className='space-y-6'>
            {/* Core Settings */}
            {renderSettingsGroup('Core Settings', coreSettingsNavigation)}

            {/* Pro Settings */}
            {renderSettingsGroup('Pro Features', proSettingsNavigation, true)}

            {/* Billing */}
            {renderSettingsGroup('Billing', billingNavigation)}
          </nav>
        </div>
      </div>

      {/* Settings Content */}
      <div className='flex-1 min-w-0 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2'>
        {renderContent()}
      </div>
    </div>
  );
}
