'use client';

import { RocketLaunchIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';
import {
  type ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Input } from '@/components/atoms/Input';
import {
  AppearanceSettingsSection,
  BillingSettingsSection,
  BrandingSettingsSection,
  NotificationsSettingsSection,
  PixelSettingsSection,
} from '@/components/dashboard/settings';
import { SettingsStatusPill } from '@/components/dashboard/molecules/SettingsStatusPill';
import { AccountSettingsSection } from '@/components/dashboard/organisms/AccountSettingsSection';
import { SettingsProGateCard } from '@/components/dashboard/organisms/SettingsProGateCard';
import { SettingsSection } from '@/components/dashboard/organisms/SettingsSection';
import { useToast } from '@/components/molecules/ToastContainer';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import { APP_URL } from '@/constants/app';
import { useBillingStatus } from '@/hooks/use-billing-status';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '@/lib/images/config';
import { debounce } from '@/lib/utils';
import type { Artist } from '@/types/db';
import { DashboardCard } from '../atoms/DashboardCard';

interface SettingsPolishedProps {
  artist: Artist;
  onArtistUpdate?: (updatedArtist: Artist) => void;
  focusSection?: string;
}

const SETTINGS_BUTTON_CLASS = 'w-full sm:w-auto';

export function SettingsPolished({
  artist,
  onArtistUpdate,
  focusSection,
}: SettingsPolishedProps) {
  const router = useRouter();
  const billingStatus = useBillingStatus();
  const { isPro } = billingStatus;
  const [isBillingLoading, setIsBillingLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: artist.handle || '',
    displayName: artist.name || '',
  });

  const [profileSaveStatus, setProfileSaveStatus] = useState<{
    saving: boolean;
    success: boolean | null;
    error: string | null;
  }>({
    saving: false,
    success: null,
    error: null,
  });

  const lastProfileSavedRef = useRef<{
    displayName: string;
    username: string;
  } | null>(null);

  const { showToast } = useToast();
  const maxAvatarSize = AVATAR_MAX_FILE_SIZE_BYTES;
  const acceptedAvatarTypes = SUPPORTED_IMAGE_MIME_TYPES;
  const appDomain = APP_URL.replace(/^https?:\/\//, '');

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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            updates: { avatarUrl: imageUrl },
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            (data as { error?: string }).error || 'Failed to update profile photo'
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

        if (warning) {
          showToast({ type: 'warning', message: warning });
        }
      } catch (error) {
        if (onArtistUpdate) {
          onArtistUpdate({ ...artist, image_url: previousImage });
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

  const handleBilling = useCallback(async () => {
    setIsBillingLoading(true);
    await router.push('/app/settings/billing');
  }, [router]);

  const saveProfile = useCallback(
    async (next: { displayName: string; username: string }) => {
      const displayName = next.displayName.trim();
      const username = next.username.trim();

      if (!displayName || !username) return;

      const lastSaved = lastProfileSavedRef.current;
      if (
        lastSaved &&
        lastSaved.displayName === displayName &&
        lastSaved.username === username
      ) {
        return;
      }

      setProfileSaveStatus({ saving: true, success: null, error: null });

      try {
        const response = await fetch('/api/dashboard/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            updates: { username, displayName },
          }),
        });

        const data = (await response.json().catch(() => ({}))) as {
          profile?: {
            username?: string;
            usernameNormalized?: string;
            displayName?: string;
            bio?: string | null;
          };
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || 'Failed to update profile');
        }

        lastProfileSavedRef.current = { displayName, username };

        if (data.profile && onArtistUpdate) {
          onArtistUpdate({
            ...artist,
            handle: data.profile.username ?? artist.handle,
            name: data.profile.displayName ?? artist.name,
            tagline: data.profile.bio ?? artist.tagline,
          });
        }

        setFormData(prev => ({
          ...prev,
          username: data.profile?.username ?? username,
          displayName: data.profile?.displayName ?? displayName,
        }));

        setProfileSaveStatus({ saving: false, success: true, error: null });
        router.refresh();
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Failed to update profile';
        setProfileSaveStatus({ saving: false, success: false, error: message });
        showToast({ type: 'error', message });
      }
    },
    [artist, onArtistUpdate, router, showToast]
  );

  useEffect(() => {
    lastProfileSavedRef.current = {
      displayName: artist.name || '',
      username: artist.handle || '',
    };
    setProfileSaveStatus({ saving: false, success: null, error: null });
  }, [artist.handle, artist.name]);

  const debouncedProfileSave = useMemo(
    () =>
      debounce(async (...args: unknown[]) => {
        const [next] = args as [{ displayName: string; username: string }];
        await saveProfile(next);
      }, 900),
    [saveProfile]
  );

  useEffect(() => {
    return () => {
      debouncedProfileSave.flush();
    };
  }, [debouncedProfileSave]);

  useEffect(() => {
    if (!profileSaveStatus.success) return;
    const timeoutId = window.setTimeout(() => {
      setProfileSaveStatus(prev => ({ ...prev, success: null }));
    }, 1500);
    return () => window.clearTimeout(timeoutId);
  }, [profileSaveStatus.success]);

  const renderProfileSection = () => (
    <DashboardCard variant='settings' className='relative'>
      {profileSaveStatus.saving ? (
        <SettingsStatusPill state='saving' className='absolute right-6 top-6' />
      ) : profileSaveStatus.success ? (
        <SettingsStatusPill state='saved' className='absolute right-6 top-6' />
      ) : null}
      <div className='flex flex-col gap-6'>
        <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <p className='text-sm text-secondary-token'>
              Photo, name, username.
            </p>
          </div>
        </div>

        <div className='grid gap-6 lg:grid-cols-[240px,1fr]'>
          <div>
            <div className='flex justify-center'>
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
            <p className='text-sm text-secondary text-center mt-3'>
              Drag & drop or click to upload.
            </p>
          </div>

          <div className='space-y-6'>
            <div>
              <label
                htmlFor='username'
                className='block text-xs font-medium text-primary-token mb-2'
              >
                Username
              </label>
              <div className='mb-2 text-xs text-secondary-token/70'>
                Used in your profile URL
              </div>
              <div className='relative'>
                <div className='flex rounded-lg shadow-sm'>
                  <span className='inline-flex items-center px-3 rounded-l-lg border border-r-0 border-subtle bg-surface-2 text-secondary-token text-sm select-none'>
                    {appDomain}/
                  </span>
                  <Input
                    type='text'
                    name='username'
                    id='username'
                    value={formData.username}
                    onChange={e => {
                      const nextValue = e.target.value;
                      setFormData(prev => {
                        const next = { ...prev, username: nextValue };
                        setProfileSaveStatus(s => ({
                          ...s,
                          success: null,
                          error: null,
                        }));
                        debouncedProfileSave({
                          displayName: next.displayName,
                          username: next.username,
                        });
                        return next;
                      });
                    }}
                    onBlur={() => debouncedProfileSave.flush()}
                    placeholder='yourname'
                    className='flex-1 min-w-0'
                    inputClassName='block w-full px-3 py-2 rounded-none rounded-r-lg border border-subtle bg-surface-1 text-primary placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base focus-visible:border-transparent sm:text-sm transition-colors'
                  />
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor='displayName'
                className='block text-xs font-medium text-primary-token mb-2'
              >
                Display Name
              </label>
              <Input
                type='text'
                name='displayName'
                id='displayName'
                value={formData.displayName}
                onChange={e => {
                  const nextValue = e.target.value;
                  setFormData(prev => {
                    const next = { ...prev, displayName: nextValue };
                    setProfileSaveStatus(s => ({
                      ...s,
                      success: null,
                      error: null,
                    }));
                    debouncedProfileSave({
                      displayName: next.displayName,
                      username: next.username,
                    });
                    return next;
                  });
                }}
                onBlur={() => debouncedProfileSave.flush()}
                placeholder='The name your fans will see'
                inputClassName='block w-full px-3 py-2 border border-subtle rounded-lg bg-surface-1 text-primary placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base focus-visible:border-transparent sm:text-sm shadow-sm transition-colors'
              />
            </div>
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

  const renderProUpgradeCard = (
    title: string,
    description: string,
    icon: ComponentType<{ className?: string }>
  ) => (
    <SettingsProGateCard
      title={title}
      description={description}
      icon={icon}
      onUpgrade={() => void handleBilling()}
      loading={isBillingLoading || billingStatus.loading}
      buttonClassName={SETTINGS_BUTTON_CLASS}
    />
  );

  const sections = useMemo(
    () => [
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
        render: () => <AppearanceSettingsSection />,
      },
      {
        id: 'notifications',
        title: 'Notifications',
        description: 'Manage your email preferences and communication settings.',
        render: () => <NotificationsSettingsSection />,
      },
      {
        id: 'remove-branding',
        title: 'Remove Branding',
        description:
          'Remove Jovie branding to create a fully custom experience for your fans.',
        render: () =>
          isPro ? (
            <BrandingSettingsSection
              artist={artist}
              onArtistUpdate={onArtistUpdate}
            />
          ) : (
            renderProUpgradeCard(
              'Professional Appearance',
              'Remove Jovie branding to create a fully custom experience for your fans.',
              SparklesIcon
            )
          ),
      },
      {
        id: 'ad-pixels',
        title: 'Ad Pixels',
        description:
          'Connect Facebook, Google, and TikTok pixels to track conversions.',
        render: () =>
          isPro ? (
            <PixelSettingsSection />
          ) : (
            renderProUpgradeCard(
              'Unlock Growth Tracking',
              'Seamlessly integrate Facebook, Google, and TikTok pixels.',
              RocketLaunchIcon
            )
          ),
      },
      {
        id: 'billing',
        title: 'Billing & Subscription',
        description:
          'Manage your subscription, payment methods, and billing history.',
        render: () => <BillingSettingsSection />,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPro, artist, onArtistUpdate]
  );

  const visibleSections = focusSection
    ? sections.filter(section => section.id === focusSection)
    : sections;

  return (
    <div className='space-y-8 pb-8' data-testid='settings-polished'>
      {visibleSections.map(section => (
        <SettingsSection
          key={section.id}
          id={section.id}
          title={section.title}
          description={section.description}
        >
          {section.render()}
        </SettingsSection>
      ))}
    </div>
  );
}
