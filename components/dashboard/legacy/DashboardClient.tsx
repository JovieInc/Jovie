'use client';

import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  TransitionChild,
} from '@headlessui/react';
import {
  Bars3Icon,
  ChartPieIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Cog6ToothIcon,
  HomeIcon,
  LinkIcon,
  UsersIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PendingClaimRunner } from '@/components/bridge/PendingClaimRunner';
import { OnboardingForm } from '@/components/dashboard';
import { AnalyticsCards } from '@/components/dashboard/molecules/AnalyticsCards';
import { EnhancedThemeToggle } from '@/components/dashboard/molecules/EnhancedThemeToggle';
import { DashboardSplitView } from '@/components/dashboard/organisms/DashboardSplitView';
import { SettingsPolished } from '@/components/dashboard/organisms/SettingsPolished';
import { UserButton } from '@/components/molecules/UserButton';
import { Logo } from '@/components/ui/Logo';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { APP_NAME, APP_URL } from '@/constants/app';
import type { CreatorProfile } from '@/lib/db/schema';
import { cn } from '@/lib/utils';
import { Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';
import { PendingClaimHandler } from '../PendingClaimHandler';

const navigation = [
  {
    name: 'Overview',
    id: 'overview',
    icon: HomeIcon,
  },
  {
    name: 'Links',
    id: 'links',
    icon: LinkIcon,
  },
  {
    name: 'Analytics',
    id: 'analytics',
    icon: ChartPieIcon,
  },
  {
    name: 'Audience',
    id: 'audience',
    icon: UsersIcon,
  },
  {
    name: 'Settings',
    id: 'settings',
    icon: Cog6ToothIcon,
  },
];

interface DashboardClientProps {
  initialData: {
    user: { id: string } | null;
    creatorProfiles: CreatorProfile[];
    selectedProfile: CreatorProfile | null;
    needsOnboarding: boolean;
  };
}

export function DashboardClient({ initialData }: DashboardClientProps) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentNavItem, setCurrentNavItem] = useState('overview');
  const [artist, setArtist] = useState<Artist | null>(
    initialData.selectedProfile
      ? convertDrizzleCreatorProfileToArtist(initialData.selectedProfile)
      : null
  );
  const [creatorProfiles] = useState<CreatorProfile[]>(
    initialData.creatorProfiles
  );
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    initialData.selectedProfile?.id || null
  );

  const handleArtistUpdated = (updatedArtist: Artist) => {
    setArtist(updatedArtist);
  };

  // Handle profile selection when user has multiple creator profiles
  const handleProfileSelection = (profileId: string) => {
    const selectedProfile = creatorProfiles.find(p => p.id === profileId);
    if (selectedProfile) {
      setSelectedProfileId(profileId);
      const artistData = convertDrizzleCreatorProfileToArtist(selectedProfile);
      setArtist(artistData);
    }
  };

  const handleNavigation = (navId: string) => {
    setCurrentNavItem(navId);
  };

  if (initialData.needsOnboarding) {
    return (
      <div className='min-h-screen bg-base transition-colors'>
        {/* Subtle grid background pattern */}
        <div className='absolute inset-0 grid-bg dark:grid-bg-dark' />

        {/* Gradient orbs - more subtle like Linear */}
        <div className='absolute top-0 left-1/4 w-96 h-96 bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-full blur-3xl' />
        <div className='absolute bottom-0 right-1/4 w-96 h-96 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-full blur-3xl' />

        {/* Theme Toggle */}
        <div className='absolute top-4 right-4 z-20'>
          <EnhancedThemeToggle />
        </div>

        <div className='relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
          <div className='flex min-h-screen items-center justify-center py-8'>
            <div className='w-full max-w-md'>
              {/* App Icon */}
              <div className='flex justify-center mb-6'>
                <div className='w-16 h-16 rounded-2xl bg-surface-1 border border-subtle flex items-center justify-center shadow-lg'>
                  <Image
                    src='/android-chrome-512x512.png'
                    alt='Jovie Logo'
                    width={48}
                    height={48}
                    className='w-12 h-12 object-contain'
                    priority={true}
                  />
                </div>
              </div>

              {/* Header */}
              <div className='text-center mb-6'>
                <h1 className='text-3xl font-semibold text-primary-token mb-1 transition-colors'>
                  Welcome to {APP_NAME}
                </h1>
                <p className='text-secondary-token transition-colors'>
                  Claim your handle to launch your artist profile
                </p>
              </div>

              {/* Form Card */}
              <div className='bg-surface-1 backdrop-blur-sm border border-subtle rounded-xl p-6 shadow-xl transition-colors'>
                <OnboardingForm />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!artist) {
    return null; // This shouldn't happen given the server-side logic
  }

  return (
    <>
      <PendingClaimRunner />
      <PendingClaimHandler />

      <div className='min-h-screen bg-base transition-colors relative'>
        {/* Subtle background pattern */}
        <div className='absolute inset-0 opacity-50 grid-bg dark:grid-bg-dark pointer-events-none' />
        {/* Gradient orbs for visual depth */}
        <div className='absolute top-0 right-1/4 w-96 h-96 bg-gradient-to-r from-purple-500/5 to-blue-500/5 rounded-full blur-3xl pointer-events-none' />
        <div className='absolute bottom-1/4 left-1/3 w-96 h-96 bg-gradient-to-r from-blue-500/5 to-cyan-500/5 rounded-full blur-3xl pointer-events-none' />

        {/* Mobile sidebar */}
        <Dialog
          open={sidebarOpen}
          onClose={setSidebarOpen}
          className='relative z-50 lg:hidden'
        >
          <DialogBackdrop
            transition
            className='fixed inset-0 bg-black/70 transition-opacity duration-300 ease-linear data-[closed]:opacity-0'
          />
          <div className='fixed inset-0 flex'>
            <DialogPanel
              transition
              className='relative mr-16 flex w-full max-w-xs flex-1 transform transition duration-300 ease-in-out data-[closed]:-translate-x-full'
            >
              <TransitionChild>
                <div className='absolute left-full top-0 flex w-16 justify-center pt-5 duration-300 ease-in-out data-[closed]:opacity-0'>
                  <button
                    type='button'
                    className='-m-2.5 p-2.5'
                    onClick={() => setSidebarOpen(false)}
                  >
                    <span className='sr-only'>Close sidebar</span>
                    <XMarkIcon
                      className='h-6 w-6 text-white'
                      aria-hidden='true'
                    />
                  </button>
                </div>
              </TransitionChild>
              <div className='flex grow flex-col gap-y-5 overflow-y-auto bg-surface-0 backdrop-blur-sm px-6 pb-4 border-r border-subtle'>
                <div className='flex h-16 shrink-0 items-center'>
                  <button
                    onClick={() => {
                      setCurrentNavItem('overview');
                      setSidebarOpen(false);
                    }}
                    className='focus-visible:outline-none focus-visible:ring-2 ring-accent focus-visible:ring-offset-2 rounded-md'
                  >
                    <Logo size='md' />
                  </button>
                </div>
                <nav className='flex flex-1 flex-col'>
                  <ul role='list' className='flex flex-1 flex-col gap-y-7'>
                    <li>
                      <ul role='list' className='-mx-2 space-y-1'>
                        {navigation.map(item => (
                          <li key={item.name}>
                            <button
                              onClick={() => handleNavigation(item.id)}
                              className={cn(
                                currentNavItem === item.id
                                  ? 'bg-surface-2 text-primary-token ring-1 ring-accent'
                                  : 'text-secondary-token hover:text-primary-token hover:bg-surface-2',
                                'group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold w-full text-left'
                              )}
                              aria-current={
                                currentNavItem === item.id ? 'page' : undefined
                              }
                            >
                              <item.icon
                                className={cn(
                                  currentNavItem === item.id
                                    ? 'text-primary-token'
                                    : 'text-secondary-token group-hover:text-primary-token',
                                  'h-6 w-6 shrink-0'
                                )}
                                aria-hidden='true'
                              />
                              {item.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </li>
                    {/* Profile selector in mobile sidebar */}
                    {creatorProfiles.length > 1 && (
                      <li>
                        <div className='text-xs font-semibold leading-6 text-secondary-token'>
                          Profiles
                        </div>
                        <ul role='list' className='-mx-2 mt-2 space-y-1'>
                          {creatorProfiles.map(profile => (
                            <li key={profile.id}>
                              <button
                                onClick={() =>
                                  handleProfileSelection(profile.id)
                                }
                                className={cn(
                                  selectedProfileId === profile.id
                                    ? 'bg-surface-2 text-primary-token ring-1 ring-accent'
                                    : 'text-secondary-token hover:text-primary-token hover:bg-surface-2',
                                  'group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold w-full text-left'
                                )}
                              >
                                {profile.avatarUrl ? (
                                  <OptimizedImage
                                    src={profile.avatarUrl}
                                    alt={
                                      profile.displayName || profile.username
                                    }
                                    size='sm'
                                    shape='circle'
                                    aspectRatio='square'
                                    objectFit='cover'
                                    priority={false}
                                    quality={75}
                                  />
                                ) : (
                                  <div className='h-6 w-6 rounded-full bg-gradient-to-br from-surface-2 to-surface-1 border border-subtle flex items-center justify-center'>
                                    <span className='text-xs font-medium text-secondary-token'>
                                      {(
                                        profile.displayName ||
                                        profile.username ||
                                        'U'
                                      )
                                        .charAt(0)
                                        .toUpperCase()}
                                    </span>
                                  </div>
                                )}
                                <span className='truncate'>
                                  {profile.displayName || profile.username}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </li>
                    )}
                  </ul>
                  {/* Theme toggle and UserButton in mobile sidebar */}
                  <div className='mt-auto pt-4 border-t border-subtle space-y-3'>
                    <div className='flex justify-center'>
                      <EnhancedThemeToggle />
                    </div>
                    <UserButton artist={artist} showUserInfo={true} />
                  </div>
                </nav>
              </div>
            </DialogPanel>
          </div>
        </Dialog>

        {/* Static sidebar for desktop */}
        <div
          className={cn(
            'hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:flex-col transition-all duration-300 ease-in-out',
            sidebarCollapsed ? 'lg:w-16' : 'lg:w-72'
          )}
        >
          <div
            className={cn(
              'flex grow flex-col gap-y-5 overflow-y-auto border-r border-subtle bg-surface-0 backdrop-blur-sm',
              sidebarCollapsed ? 'px-2' : 'px-6',
              'pb-4'
            )}
          >
            {sidebarCollapsed ? (
              <div className='grid grid-cols-3 h-16 items-center relative'>
                {/* Left spacer to balance grid */}
                <div />
                {/* Centered logo button */}
                <div className='justify-self-center'>
                  <button
                    onClick={() => setCurrentNavItem('overview')}
                    className='w-10 h-10 rounded-lg flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 ring-accent focus-visible:ring-offset-2 hover:bg-surface-2 transition-colors'
                    title='Go to Dashboard Overview'
                  >
                    <Image
                      src='/android-chrome-512x512.png'
                      alt='Jovie Logo'
                      width={32}
                      height={32}
                      className='w-8 h-8 object-contain'
                    />
                  </button>
                </div>
                {/* Collapse button floated right */}
                <div className='justify-self-end pr-2'>
                  <button
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    className='p-1.5 text-secondary-token hover:text-primary-token hover:bg-surface-2 rounded-md transition-colors'
                    title='Expand sidebar'
                  >
                    <ChevronRightIcon className='h-4 w-4' />
                  </button>
                </div>
              </div>
            ) : (
              <div className='flex h-16 shrink-0 items-center justify-between'>
                <div className='flex items-center'>
                  <button
                    onClick={() => setCurrentNavItem('overview')}
                    className='focus-visible:outline-none focus-visible:ring-2 ring-accent focus-visible:ring-offset-2 rounded-md'
                  >
                    <Logo size='md' />
                  </button>
                </div>
                <button
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  className='p-1.5 text-secondary-token hover:text-primary-token hover:bg-surface-2 rounded-md transition-colors'
                  title='Collapse sidebar'
                >
                  <ChevronLeftIcon className='h-4 w-4' />
                </button>
              </div>
            )}
            <nav className='flex flex-1 flex-col'>
              <ul role='list' className='flex flex-1 flex-col gap-y-7'>
                <li>
                  <ul role='list' className='-mx-2 space-y-1'>
                    {navigation.map(item => (
                      <li key={item.name}>
                        <button
                          onClick={() => handleNavigation(item.id)}
                          className={cn(
                            currentNavItem === item.id
                              ? 'bg-surface-2 text-primary-token ring-1 ring-accent'
                              : 'text-secondary-token hover:text-primary-token hover:bg-surface-2',
                            'group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold w-full text-left',
                            sidebarCollapsed ? 'justify-center' : ''
                          )}
                          title={sidebarCollapsed ? item.name : undefined}
                          aria-current={
                            currentNavItem === item.id ? 'page' : undefined
                          }
                        >
                          <item.icon
                            className={cn(
                              currentNavItem === item.id
                                ? 'text-primary-token'
                                : 'text-secondary-token group-hover:text-primary-token',
                              'h-6 w-6 shrink-0'
                            )}
                            aria-hidden='true'
                          />
                          {!sidebarCollapsed && item.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
                {/* Profile selector in desktop sidebar - hidden when collapsed */}
                {!sidebarCollapsed && creatorProfiles.length > 1 && (
                  <li>
                    <div className='text-xs font-semibold leading-6 text-secondary-token'>
                      Profiles
                    </div>
                    <ul role='list' className='-mx-2 mt-2 space-y-1'>
                      {creatorProfiles.map(profile => (
                        <li key={profile.id}>
                          <button
                            onClick={() => handleProfileSelection(profile.id)}
                            className={cn(
                              selectedProfileId === profile.id
                                ? 'bg-surface-2 text-primary-token ring-1 ring-accent'
                                : 'text-secondary-token hover:text-primary-token hover:bg-surface-2',
                              'group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold w-full text-left'
                            )}
                          >
                            {profile.avatarUrl ? (
                              <OptimizedImage
                                src={profile.avatarUrl}
                                alt={profile.displayName || profile.username}
                                size='sm'
                                shape='circle'
                                aspectRatio='square'
                                objectFit='cover'
                                priority={false}
                                quality={75}
                              />
                            ) : (
                              <div className='h-6 w-6 rounded-full bg-gradient-to-br from-surface-2 to-surface-1 border border-subtle flex items-center justify-center'>
                                <span className='text-xs font-medium text-secondary-token'>
                                  {(
                                    profile.displayName ||
                                    profile.username ||
                                    'U'
                                  )
                                    .charAt(0)
                                    .toUpperCase()}
                                </span>
                              </div>
                            )}
                            <span className='truncate'>
                              {profile.displayName || profile.username}
                            </span>
                          </button>
                        </li>
                      ))}
                      <li>
                        <button
                          onClick={() => router.push('/onboarding')}
                          className='text-secondary-token hover:text-primary-token hover:bg-surface-2 group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold w-full text-left border border-dashed border-subtle'
                        >
                          <svg
                            className='h-6 w-6 shrink-0 text-secondary-token group-hover:text-primary-token'
                            fill='none'
                            stroke='currentColor'
                            viewBox='0 0 24 24'
                          >
                            <path
                              strokeLinecap='round'
                              strokeLinejoin='round'
                              strokeWidth={2}
                              d='M12 4v16m8-8H4'
                            />
                          </svg>
                          <span className='truncate'>Create New Profile</span>
                        </button>
                      </li>
                    </ul>
                  </li>
                )}

                {/* UserButton in sidebar with user info */}
                <li className='mt-auto'>
                  {/* Pro Upgrade - moved above horizontal line */}
                  {!sidebarCollapsed && (
                    <div className='mb-4'>
                      <button
                        onClick={() => router.push('/pricing')}
                        className='inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-white shadow-lg hover:shadow-xl hover:shadow-accent/25 hover:brightness-110 transition-all duration-300 w-full gap-2 focus-visible:outline-none focus-visible:ring-2 ring-accent transform hover:-translate-y-0.5'
                        style={{ backgroundColor: 'var(--color-accent)' }}
                      >
                        <svg
                          className='h-4 w-4 flex-shrink-0 animate-pulse filter drop-shadow-[0_0_10px_rgba(255,255,255,0.15)]'
                          fill='none'
                          stroke='currentColor'
                          viewBox='0 0 24 24'
                        >
                          <path
                            strokeLinecap='round'
                            strokeLinejoin='round'
                            strokeWidth={2}
                            d='M13 10V3L4 14h7v7l9-11h-7z'
                          />
                        </svg>
                        Upgrade to Pro
                      </button>
                    </div>
                  )}

                  {/* Theme toggle, horizontal divider, and user info */}
                  <div className='pt-4 space-y-3'>
                    {/* Soft gradient divider */}
                    <div className='h-px bg-gradient-to-r from-transparent via-subtle-token to-transparent' />
                    <div className='flex justify-center'>
                      <EnhancedThemeToggle />
                    </div>
                    <div
                      className={cn(
                        'flex',
                        sidebarCollapsed ? 'justify-center' : ''
                      )}
                    >
                      {!sidebarCollapsed && artist ? (
                        <UserButton artist={artist} showUserInfo={true} />
                      ) : (
                        <UserButton artist={artist} />
                      )}
                    </div>
                  </div>
                </li>
              </ul>
            </nav>
          </div>
        </div>

        <div
          className={cn(
            'transition-all duration-300 ease-in-out',
            sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-72'
          )}
        >
          {/* Mobile header bar - minimal */}
          <div className='sticky top-0 z-40 lg:hidden flex h-12 shrink-0 items-center gap-x-4 bg-surface-0/95 backdrop-blur-md px-4 border-b border-subtle'>
            <button
              type='button'
              className='-m-2.5 p-2.5 text-secondary-token'
              onClick={() => setSidebarOpen(true)}
            >
              <span className='sr-only'>Open sidebar</span>
              <Bars3Icon
                className='h-5 w-5 text-secondary-token'
                aria-hidden='true'
              />
            </button>
          </div>

          <main className={currentNavItem === 'settings' ? '' : 'py-10'}>
            <div
              className={
                currentNavItem === 'settings' ? '' : 'px-4 sm:px-6 lg:px-8'
              }
            >
              {/* Main content area */}
              {currentNavItem === 'overview' && artist && (
                <>
                  <div className='mb-8'>
                    <h1 className='text-2xl font-bold text-primary-token'>
                      Welcome back, {artist.name || artist.handle}!
                    </h1>
                    <p className='text-secondary-token mt-1'>
                      Here&apos;s what&apos;s happening with your profile
                    </p>
                  </div>

                  {/* Quick Actions CTA Cards with enhanced micro-animations */}
                  <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 relative z-10'>
                    <button
                      onClick={() => handleNavigation('links')}
                      className='bg-surface-1 backdrop-blur-sm rounded-xl border border-subtle p-6 text-left hover:shadow-xl hover:shadow-accent/10 hover:ring-1 ring-accent hover:border-accent/30 hover:bg-surface-2 transition-all duration-300 group card-hover btn-press'
                    >
                      <div className='flex items-center justify-between mb-3'>
                        <LinkIcon className='h-8 w-8 text-accent-token' />
                        <ChevronRightIcon className='h-5 w-5 text-secondary-token group-hover:text-accent-token transition-colors' />
                      </div>
                      <h3 className='text-lg font-medium text-primary-token mb-2'>
                        Manage Links
                      </h3>
                      <p className='text-sm text-secondary-token'>
                        Add your social media and streaming platform links
                      </p>
                    </button>

                    <button
                      onClick={() => handleNavigation('analytics')}
                      className='bg-surface-1 backdrop-blur-sm rounded-xl border border-subtle p-6 text-left hover:shadow-xl hover:shadow-accent/10 hover:ring-1 ring-accent hover:border-accent/30 hover:bg-surface-2 transition-all duration-300 group card-hover btn-press'
                    >
                      <div className='flex items-center justify-between mb-3'>
                        <ChartPieIcon className='h-8 w-8 text-accent-token' />
                        <ChevronRightIcon className='h-5 w-5 text-secondary-token group-hover:text-accent-token transition-colors' />
                      </div>
                      <h3 className='text-lg font-medium text-primary-token mb-2'>
                        View Analytics
                      </h3>
                      <p className='text-sm text-secondary-token'>
                        Track your profile performance and engagement
                      </p>
                    </button>

                    <button
                      onClick={() => handleNavigation('audience')}
                      className='bg-surface-1 backdrop-blur-sm rounded-xl border border-subtle p-6 text-left hover:shadow-xl hover:shadow-accent/10 hover:ring-1 ring-accent hover:border-accent/30 hover:bg-surface-2 transition-all duration-300 group card-hover btn-press'
                    >
                      <div className='flex items-center justify-between mb-3'>
                        <UsersIcon className='h-8 w-8 text-accent-token' />
                        <ChevronRightIcon className='h-5 w-5 text-secondary-token group-hover:text-accent-token transition-colors' />
                      </div>
                      <h3 className='text-lg font-medium text-primary-token mb-2'>
                        Manage Audience
                      </h3>
                      <p className='text-sm text-secondary-token'>
                        Understand and engage with your fanbase
                      </p>
                    </button>

                    <button
                      onClick={() => handleNavigation('settings')}
                      className='bg-surface-1 backdrop-blur-sm rounded-xl border border-subtle p-6 text-left hover:shadow-xl hover:shadow-accent/10 hover:ring-1 ring-accent hover:border-accent/30 hover:bg-surface-2 transition-all duration-300 group card-hover btn-press'
                    >
                      <div className='flex items-center justify-between mb-3'>
                        <Cog6ToothIcon className='h-8 w-8 text-accent-token' />
                        <ChevronRightIcon className='h-5 w-5 text-secondary-token group-hover:text-accent-token transition-colors' />
                      </div>
                      <h3 className='text-lg font-medium text-primary-token mb-2'>
                        Profile Settings
                      </h3>
                      <p className='text-sm text-secondary-token'>
                        Customize your profile and account preferences
                      </p>
                    </button>
                  </div>

                  {/* Quick Stats */}
                  <div className='mt-8'>
                    <h3 className='text-lg font-medium text-primary-token mb-4'>
                      Quick Stats
                    </h3>
                    <AnalyticsCards
                      profileUrl={`${APP_URL}/${artist.handle}`}
                    />
                  </div>

                  {/* Recent Activity Card */}
                  <div className='mt-8 bg-surface-1 backdrop-blur-sm rounded-xl border border-subtle p-6 relative z-10'>
                    <h3 className='text-lg font-medium text-primary-token mb-4'>
                      Recent Activity
                    </h3>
                    <div className='space-y-3'>
                      <div className='flex items-center gap-3 p-3 rounded-lg bg-surface-2'>
                        <div className='w-2 h-2 bg-green-500 rounded-full'></div>
                        <div className='flex-1'>
                          <p className='text-sm font-medium text-primary-token'>
                            Profile updated
                          </p>
                          <span className='text-xs text-secondary'>
                            2 hours ago
                          </span>
                        </div>
                        <p className='text-xs text-secondary mt-0.5'>
                          Your profile information was successfully updated
                        </p>
                      </div>
                      <div className='flex items-center gap-3 p-3 rounded-lg bg-surface-2/30'>
                        <div className='w-2 h-2 bg-blue-500 rounded-full'></div>
                        <div className='flex-1'>
                          <p className='text-sm font-medium text-primary-token'>
                            New link added
                          </p>
                          <span className='text-xs text-secondary'>
                            1 day ago
                          </span>
                        </div>
                        <p className='text-xs text-secondary mt-0.5'>
                          Added music streaming link to your profile
                        </p>
                      </div>
                      <div className='flex items-center gap-3 p-3 rounded-lg bg-surface-2/30'>
                        <div className='w-2 h-2 bg-purple-500 rounded-full'></div>
                        <div className='flex-1'>
                          <p className='text-sm font-medium text-primary-token'>
                            Analytics milestone reached
                          </p>
                          <span className='text-xs text-secondary'>
                            3 days ago
                          </span>
                        </div>
                        <p className='text-xs text-secondary mt-0.5'>
                          Your profile reached 100 profile views this month
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {currentNavItem === 'links' && (
                <>
                  {/* Use the full DashboardSplitView for universal inputs and live preview */}
                  <DashboardSplitView
                    artist={artist}
                    onArtistUpdate={handleArtistUpdated}
                  />
                </>
              )}

              {currentNavItem === 'analytics' && (
                <div className='space-y-6 relative z-10'>
                  <div>
                    <h2 className='text-xl font-semibold text-primary-token mb-2'>
                      Analytics
                    </h2>
                    <p className='text-sm text-secondary-token mb-6'>
                      Track your profile performance and link engagement
                    </p>
                  </div>

                  {/* Analytics Cards */}
                  <AnalyticsCards profileUrl={`${APP_URL}/${artist.handle}`} />

                  {/* Additional analytics info */}
                  <div className='mt-8 bg-surface-1 backdrop-blur-sm rounded-lg p-6 border border-subtle hover:shadow-lg hover:border-accent/10 transition-all duration-300 relative z-10'>
                    <h3 className='text-sm font-medium text-primary-token mb-2'>
                      Coming Soon
                    </h3>
                    <p className='text-sm text-secondary-token'>
                      Detailed analytics with charts, traffic sources, and
                      demographic insights will be available soon.
                    </p>
                  </div>
                </div>
              )}

              {currentNavItem === 'audience' && (
                <div className='space-y-6 relative z-10'>
                  <div>
                    <h2 className='text-xl font-semibold text-primary-token mb-2'>
                      Audience
                    </h2>
                    <p className='text-sm text-secondary-token mb-6'>
                      Understand your fanbase demographics and engagement
                      patterns
                    </p>
                  </div>

                  {/* Audience Overview Cards */}
                  <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 relative z-10'>
                    <div className='bg-surface-1 backdrop-blur-sm rounded-lg border border-subtle p-4 hover:shadow-lg hover:border-accent/20 transition-all duration-300'>
                      <div className='flex items-center justify-between'>
                        <div>
                          <p className='text-sm font-medium text-secondary-token'>
                            Total Followers
                          </p>
                          <p className='text-2xl font-bold text-primary-token'>
                            1,247
                          </p>
                        </div>
                        <UsersIcon className='h-8 w-8 text-accent-token' />
                      </div>
                      <p className='text-xs text-green-600 dark:text-green-400 mt-2'>
                        +12% from last month
                      </p>
                    </div>

                    <div className='bg-surface-1/80 backdrop-blur-sm rounded-lg border border-subtle/50 p-4 hover:shadow-lg hover:border-accent/20 transition-all duration-300'>
                      <div className='flex items-center justify-between'>
                        <div>
                          <p className='text-sm font-medium text-secondary-token'>
                            Engagement Rate
                          </p>
                          <p className='text-2xl font-bold text-primary-token'>
                            4.2%
                          </p>
                        </div>
                        <div className='h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center'>
                          <span className='text-lg'>📊</span>
                        </div>
                      </div>
                      <p className='text-xs text-green-600 dark:text-green-400 mt-2'>
                        +0.3% from last month
                      </p>
                    </div>

                    <div className='bg-surface-1/80 backdrop-blur-sm rounded-lg border border-subtle/50 p-4 hover:shadow-lg hover:border-accent/20 transition-all duration-300'>
                      <div className='flex items-center justify-between'>
                        <div>
                          <p className='text-sm font-medium text-secondary-token'>
                            Monthly Listeners
                          </p>
                          <p className='text-2xl font-bold text-primary-token'>
                            8,934
                          </p>
                        </div>
                        <div className='h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center'>
                          <span className='text-lg'>🎵</span>
                        </div>
                      </div>
                      <p className='text-xs text-blue-600 dark:text-blue-400 mt-2'>
                        +5.7% from last month
                      </p>
                    </div>

                    <div className='bg-surface-1/80 backdrop-blur-sm rounded-lg border border-subtle/50 p-4 hover:shadow-lg hover:border-accent/20 transition-all duration-300'>
                      <div className='flex items-center justify-between'>
                        <div>
                          <p className='text-sm font-medium text-secondary-token'>
                            Top Location
                          </p>
                          <p className='text-2xl font-bold text-primary-token'>
                            🇺🇸 US
                          </p>
                        </div>
                        <div className='h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center'>
                          <span className='text-lg'>🌍</span>
                        </div>
                      </div>
                      <p className='text-xs text-secondary-token mt-2'>
                        45% of total audience
                      </p>
                    </div>
                  </div>

                  {/* Demographics Section */}
                  <div className='bg-surface-1 backdrop-blur-sm rounded-lg border border-subtle p-6 hover:shadow-lg hover:border-accent/10 transition-all duration-300 relative z-10'>
                    <h3 className='text-lg font-medium text-primary-token mb-4'>
                      Demographics
                    </h3>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                      <div>
                        <h4 className='text-sm font-medium text-primary-token mb-3'>
                          Age Groups
                        </h4>
                        <div className='space-y-2'>
                          <div className='flex justify-between items-center'>
                            <span className='text-sm text-secondary-token'>
                              18-24
                            </span>
                            <div className='flex items-center gap-2'>
                              <div className='w-16 h-2 bg-surface-2 rounded-full'>
                                <div className='w-3/4 h-full bg-blue-500 rounded-full'></div>
                              </div>
                              <span className='text-sm font-medium text-primary-token'>
                                35%
                              </span>
                            </div>
                          </div>
                          <div className='flex justify-between items-center'>
                            <span className='text-sm text-secondary-token'>
                              25-34
                            </span>
                            <div className='flex items-center gap-2'>
                              <div className='w-16 h-2 bg-surface-2 rounded-full'>
                                <div className='w-1/2 h-full bg-green-500 rounded-full'></div>
                              </div>
                              <span className='text-sm font-medium text-primary-token'>
                                28%
                              </span>
                            </div>
                          </div>
                          <div className='flex justify-between items-center'>
                            <span className='text-sm text-secondary-token'>
                              35-44
                            </span>
                            <div className='flex items-center gap-2'>
                              <div className='w-16 h-2 bg-surface-2 rounded-full'>
                                <div className='w-1/4 h-full bg-purple-500 rounded-full'></div>
                              </div>
                              <span className='text-sm font-medium text-primary-token'>
                                22%
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div>
                        <h4 className='text-sm font-medium text-primary-token mb-3'>
                          Top Countries
                        </h4>
                        <div className='space-y-2'>
                          <div className='flex justify-between items-center'>
                            <span className='text-sm text-secondary-token'>
                              🇺🇸 United States
                            </span>
                            <span className='text-sm font-medium text-primary-token'>
                              45%
                            </span>
                          </div>
                          <div className='flex justify-between items-center'>
                            <span className='text-sm text-secondary-token'>
                              🇬🇧 United Kingdom
                            </span>
                            <span className='text-sm font-medium text-primary-token'>
                              18%
                            </span>
                          </div>
                          <div className='flex justify-between items-center'>
                            <span className='text-sm text-secondary-token'>
                              🇨🇦 Canada
                            </span>
                            <span className='text-sm font-medium text-primary-token'>
                              12%
                            </span>
                          </div>
                          <div className='flex justify-between items-center'>
                            <span className='text-sm text-secondary-token'>
                              🇦🇺 Australia
                            </span>
                            <span className='text-sm font-medium text-primary-token'>
                              8%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Audience Insights */}
                  <div className='bg-surface-1/80 backdrop-blur-sm rounded-lg p-6 border border-subtle/50 hover:shadow-lg hover:border-accent/10 transition-all duration-300 relative z-10'>
                    <h3 className='text-sm font-medium text-primary-token mb-2'>
                      Coming Soon
                    </h3>
                    <p className='text-sm text-secondary-token'>
                      Advanced audience insights including listening habits,
                      discovery sources, and fan engagement patterns will be
                      available soon.
                    </p>
                  </div>
                </div>
              )}

              {currentNavItem === 'settings' && (
                <>
                  <div className='mb-8 px-4 sm:px-6 lg:px-8'>
                    <h1 className='text-2xl font-bold text-primary-token'>
                      Settings
                    </h1>
                    <p className='text-secondary-token mt-1'>
                      Manage your account preferences and settings
                    </p>
                  </div>
                  <SettingsPolished
                    artist={artist}
                    onArtistUpdate={handleArtistUpdated}
                  />
                </>
              )}
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
