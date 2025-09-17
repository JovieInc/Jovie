'use client';

import {
  BellIcon,
  CreditCardIcon,
  PaintBrushIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { AccountSettingsSection } from '@/components/dashboard/organisms/AccountSettingsSection';
import { BillingSection } from '@/components/molecules/BillingSection';
import { BrandingToggle } from '@/components/molecules/BrandingToggle';
import { NotificationToggle } from '@/components/molecules/NotificationToggle';
import { ProUpgradeCard } from '@/components/molecules/ProUpgradeCard';
import {
  type SettingsNavItem,
  SettingsNavigation,
} from '@/components/molecules/SettingsNavigation';
import { AppearanceSettings } from '@/components/organisms/AppearanceSettings';
import { ProfileSettings } from '@/components/organisms/ProfileSettings';
import { SettingsSection } from '@/components/organisms/SettingsSection';

import { APP_URL } from '@/constants/app';
import { useBillingStatus } from '@/hooks/use-billing-status';
import type { Artist } from '@/types/db';

interface SettingsManagerProps {
  artist: Artist;
  onArtistUpdate?: (updatedArtist: Artist) => void;
}

const settingsNavigation: SettingsNavItem[] = [
  {
    name: 'Profile',
    id: 'profile',
    icon: UserIcon,
  },
  {
    name: 'Account',
    id: 'account',
    icon: ShieldCheckIcon,
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

export function SettingsManager({
  artist,
  onArtistUpdate,
}: SettingsManagerProps) {
  const [currentSection, setCurrentSection] = useState('profile');
  const router = useRouter();
  const billingStatus = useBillingStatus();
  const { isPro } = billingStatus;

  // State for various settings
  const [hideBranding, setHideBranding] = useState(
    artist.settings?.hide_branding ?? false
  );
  const [isSavingBranding, setIsSavingBranding] = useState(false);
  const [marketingEmails, setMarketingEmails] = useState(true);
  const [isMarketingSaving, setIsMarketingSaving] = useState(false);
  const [isBillingLoading, setIsBillingLoading] = useState(false);

  const appDomain = APP_URL.replace(/^https?:\/\//, '');

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

        toast.success(
          enabled ? 'Branding hidden successfully' : 'Branding restored'
        );
      } catch (error) {
        console.error('Failed to update branding settings:', error);
        setHideBranding(!enabled);
        toast.error('Failed to update branding settings');
      } finally {
        setIsSavingBranding(false);
      }
    },
    [artist, onArtistUpdate]
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
      toast.success('Marketing preferences updated');
    } catch (error) {
      console.error('Failed to update marketing preferences:', error);
      setMarketingEmails(!enabled);
      toast.error('Failed to update marketing preferences');
    } finally {
      setIsMarketingSaving(false);
    }
  }, []);

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
      console.error('Error handling billing:', error);
      router.push('/pricing');
    } finally {
      setIsBillingLoading(false);
    }
  };

  return (
    <div className='flex gap-8'>
      <SettingsNavigation
        items={settingsNavigation}
        currentSection={currentSection}
        isPro={isPro}
        onNavigate={scrollToSection}
      />

      <div className='flex-1 min-w-0'>
        <div className='space-y-8'>
          <SettingsSection
            id='profile'
            title='Profile'
            description='Manage your public profile and account details.'
          >
            <ProfileSettings
              artist={artist}
              appDomain={appDomain}
              onArtistUpdate={onArtistUpdate}
            />
          </SettingsSection>

          <SettingsSection
            id='account'
            title='Account'
            description='Manage email addresses, password, connected accounts, and more.'
          >
            {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
              <AccountSettingsSection />
            ) : (
              <div className='text-center py-4'>
                <h3 className='text-lg font-medium text-primary mb-2'>
                  Account settings unavailable
                </h3>
                <p className='text-sm text-secondary'>
                  Clerk is not configured. Contact support for account
                  management.
                </p>
              </div>
            )}
          </SettingsSection>

          <SettingsSection
            id='appearance'
            title='Appearance'
            description='Customize how the interface looks and feels.'
          >
            <AppearanceSettings />
          </SettingsSection>

          <SettingsSection
            id='notifications'
            title='Notifications'
            description='Manage your email preferences and communication settings.'
          >
            <NotificationToggle
              marketingEmails={marketingEmails}
              onToggle={handleMarketingToggle}
              isLoading={isMarketingSaving}
            />
          </SettingsSection>

          <SettingsSection
            id='remove-branding'
            title='Remove Branding'
            description='Hide Jovie branding from your profile for a professional look.'
          >
            {isPro ? (
              <BrandingToggle
                hideBranding={hideBranding}
                onToggle={handleBrandingToggle}
                isLoading={isSavingBranding}
              />
            ) : (
              <ProUpgradeCard
                title='Professional Appearance'
                description='Remove Jovie branding to create a fully custom experience for your fans.'
                icon={SparklesIcon}
                onUpgrade={handleBilling}
                isLoading={isBillingLoading || billingStatus.loading}
              />
            )}
          </SettingsSection>

          <SettingsSection
            id='ad-pixels'
            title='Ad Pixels'
            description='Connect Facebook, Google, and TikTok pixels to track conversions.'
          >
            <ProUpgradeCard
              title='Unlock Growth Tracking'
              description='Seamlessly integrate Facebook, Google, and TikTok pixels.'
              icon={RocketLaunchIcon}
              onUpgrade={handleBilling}
              isLoading={isBillingLoading || billingStatus.loading}
            />
          </SettingsSection>

          <SettingsSection
            id='billing'
            title='Billing & Subscription'
            description='Manage your subscription, payment methods, and billing history.'
          >
            <BillingSection
              isPro={isPro}
              isLoading={isBillingLoading || billingStatus.loading}
              onBillingAction={handleBilling}
            />
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}
