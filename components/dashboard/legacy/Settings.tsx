'use client';

import {
  BellIcon,
  CreditCardIcon,
  DevicePhoneMobileIcon,
  EyeIcon,
  KeyIcon,
  PaintBrushIcon,
  ShieldCheckIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { useState } from 'react';
import type { Artist } from '@/types/db';
import { ProfileSettings } from '../organisms/ProfileSettings';
import { DatabaseThemeToggle } from './DatabaseThemeToggle';

interface SettingsProps {
  artist: Artist;
  onArtistUpdate?: (updatedArtist: Artist) => void;
}

const settingsNavigation = [
  {
    name: 'Profile',
    id: 'profile',
    icon: UserIcon,
    description: 'Manage your profile information',
  },
  {
    name: 'Appearance',
    id: 'appearance',
    icon: PaintBrushIcon,
    description: 'Theme and display preferences',
  },
  {
    name: 'Notifications',
    id: 'notifications',
    icon: BellIcon,
    description: 'Email and push notification settings',
  },
  {
    name: 'Privacy',
    id: 'privacy',
    icon: ShieldCheckIcon,
    description: 'Privacy and visibility settings',
  },
  {
    name: 'Account',
    id: 'account',
    icon: KeyIcon,
    description: 'Account security and login settings',
  },
  {
    name: 'Billing',
    id: 'billing',
    icon: CreditCardIcon,
    description: 'Subscription and payment settings',
  },
  {
    name: 'Public Profile',
    id: 'public-profile',
    icon: EyeIcon,
    description: 'How your profile appears to visitors',
  },
  {
    name: 'Mobile',
    id: 'mobile',
    icon: DevicePhoneMobileIcon,
    description: 'Mobile app and device settings',
  },
];

function classNames(...classes: (string | boolean | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function Settings({ artist, onArtistUpdate }: SettingsProps) {
  const [currentSection, setCurrentSection] = useState('profile');

  const renderSettingsContent = () => {
    switch (currentSection) {
      case 'profile':
        return (
          <ProfileSettings artist={artist} onArtistUpdate={onArtistUpdate} />
        );

      case 'appearance':
        return (
          <div className='space-y-6'>
            <div>
              <h3 className='text-lg font-medium leading-6 text-gray-900 dark:text-white'>
                Appearance
              </h3>
              <p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
                Customize how the interface looks and feels.
              </p>
            </div>

            <div className='bg-white dark:bg-neutral-800 shadow rounded-lg p-6'>
              <h4 className='text-base font-medium text-gray-900 dark:text-white mb-4'>
                Theme Preferences
              </h4>
              <div className='space-y-4'>
                <div className='flex items-center justify-between'>
                  <div>
                    <p className='text-sm font-medium text-gray-900 dark:text-white'>
                      Theme
                    </p>
                    <p className='text-sm text-gray-500 dark:text-gray-400'>
                      Choose your preferred interface theme
                    </p>
                  </div>
                  <DatabaseThemeToggle
                    onThemeChange={(theme: 'light' | 'dark' | 'system') => {
                      // Optionally update artist data or trigger other updates
                      console.log('Theme changed to:', theme);
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case 'notifications':
        return (
          <div className='space-y-6'>
            <div>
              <h3 className='text-lg font-medium leading-6 text-gray-900 dark:text-white'>
                Notifications
              </h3>
              <p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
                Manage how you receive notifications about your profile
                activity.
              </p>
            </div>

            <div className='bg-white dark:bg-neutral-800 shadow rounded-lg p-6'>
              <h4 className='text-base font-medium text-gray-900 dark:text-white mb-4'>
                Email Notifications
              </h4>
              <p className='text-sm text-gray-500 dark:text-gray-400'>
                Configure your email notification preferences here.
              </p>
            </div>
          </div>
        );

      case 'privacy':
        return (
          <div className='space-y-6'>
            <div>
              <h3 className='text-lg font-medium leading-6 text-gray-900 dark:text-white'>
                Privacy & Security
              </h3>
              <p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
                Control your privacy settings and profile visibility.
              </p>
            </div>

            <div className='bg-white dark:bg-neutral-800 shadow rounded-lg p-6'>
              <h4 className='text-base font-medium text-gray-900 dark:text-white mb-4'>
                Profile Visibility
              </h4>
              <p className='text-sm text-gray-500 dark:text-gray-400'>
                Manage who can see your profile and content.
              </p>
            </div>
          </div>
        );

      case 'account':
        return (
          <div className='space-y-6'>
            <div>
              <h3 className='text-lg font-medium leading-6 text-gray-900 dark:text-white'>
                Account Settings
              </h3>
              <p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
                Manage your account security and login preferences.
              </p>
            </div>

            <div className='bg-white dark:bg-neutral-800 shadow rounded-lg p-6'>
              <h4 className='text-base font-medium text-gray-900 dark:text-white mb-4'>
                Security
              </h4>
              <p className='text-sm text-gray-500 dark:text-gray-400'>
                Update your password and two-factor authentication settings.
              </p>
            </div>
          </div>
        );

      case 'billing':
        return (
          <div className='space-y-6'>
            <div>
              <h3 className='text-lg font-medium leading-6 text-gray-900 dark:text-white'>
                Billing & Subscription
              </h3>
              <p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
                Manage your subscription and payment methods.
              </p>
            </div>

            <div className='bg-white dark:bg-neutral-800 shadow rounded-lg p-6'>
              <h4 className='text-base font-medium text-gray-900 dark:text-white mb-4'>
                Current Plan
              </h4>
              <p className='text-sm text-gray-500 dark:text-gray-400'>
                View and manage your current subscription plan.
              </p>
            </div>
          </div>
        );

      case 'public-profile':
        return (
          <div className='space-y-6'>
            <div>
              <h3 className='text-lg font-medium leading-6 text-gray-900 dark:text-white'>
                Public Profile
              </h3>
              <p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
                Customize how your profile appears to visitors.
              </p>
            </div>

            <div className='bg-white dark:bg-neutral-800 shadow rounded-lg p-6'>
              <h4 className='text-base font-medium text-gray-900 dark:text-white mb-4'>
                Profile Appearance
              </h4>
              <p className='text-sm text-gray-500 dark:text-gray-400'>
                Control colors, layout, and branding for your public profile.
              </p>
            </div>
          </div>
        );

      case 'mobile':
        return (
          <div className='space-y-6'>
            <div>
              <h3 className='text-lg font-medium leading-6 text-gray-900 dark:text-white'>
                Mobile Settings
              </h3>
              <p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
                Configure mobile app preferences and device settings.
              </p>
            </div>

            <div className='bg-white dark:bg-neutral-800 shadow rounded-lg p-6'>
              <h4 className='text-base font-medium text-gray-900 dark:text-white mb-4'>
                Mobile Preferences
              </h4>
              <p className='text-sm text-gray-500 dark:text-gray-400'>
                Manage push notifications and mobile-specific settings.
              </p>
            </div>
          </div>
        );

      default:
        return (
          <div className='text-center py-12'>
            <h3 className='text-lg font-medium text-gray-900 dark:text-white'>
              Section not found
            </h3>
          </div>
        );
    }
  };

  return (
    <div className='flex h-full'>
      {/* Settings Sidebar */}
      <div className='w-80 bg-surface-0 border-r border-subtle flex flex-col'>
        <div className='p-6 border-b border-subtle'>
          <h2 className='text-lg font-semibold text-gray-900 dark:text-white'>
            Settings
          </h2>
          <p className='text-sm text-gray-500 dark:text-gray-400 mt-1'>
            Manage your account and profile preferences
          </p>
        </div>

        <nav className='flex-1 p-4'>
          <ul className='space-y-2'>
            {settingsNavigation.map(item => (
              <li key={item.id}>
                <button
                  onClick={() => setCurrentSection(item.id)}
                  className={classNames(
                    currentSection === item.id
                      ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                      : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-neutral-800 border-transparent',
                    'group flex w-full items-start rounded-md border p-3 text-left text-sm font-medium transition-colors'
                  )}
                >
                  <item.icon
                    className={classNames(
                      currentSection === item.id
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300',
                      'h-5 w-5 flex-shrink-0 mr-3 mt-0.5'
                    )}
                    aria-hidden='true'
                  />
                  <div>
                    <div className='font-medium'>{item.name}</div>
                    <div className='text-xs text-gray-500 dark:text-gray-400 mt-0.5'>
                      {item.description}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* Settings Content */}
      <div className='flex-1 overflow-auto'>
        <div className='p-8'>{renderSettingsContent()}</div>
      </div>
    </div>
  );
}
