import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import React from 'react';
import { UserButton } from '@/components/molecules/UserButton';
import { Logo } from '@/components/ui/Logo';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import type { CreatorProfile } from '@/lib/db/schema';
import { cn } from '@/lib/utils';
import type { Artist } from '@/types/db';
import { DashboardButton } from '../atoms/DashboardButton';
import { DashboardNavItem } from '../molecules/DashboardNavItem';
import { EnhancedThemeToggle } from '../molecules/EnhancedThemeToggle';

interface NavigationItem {
  name: string;
  id: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  isPro?: boolean;
}

interface DashboardSidebarProps {
  navigation: NavigationItem[];
  currentNavItem: string;
  onNavigate: (navId: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  artist: Artist;
  creatorProfiles: CreatorProfile[];
  selectedProfileId: string | null;
  onProfileSelection: (profileId: string) => void;
  className?: string;
}

export function DashboardSidebar({
  navigation,
  currentNavItem,
  onNavigate,
  collapsed,
  onToggleCollapsed,
  artist,
  creatorProfiles,
  selectedProfileId,
  onProfileSelection,
  className,
}: DashboardSidebarProps) {
  const router = useRouter();

  return (
    <div
      className={cn(
        'flex grow flex-col gap-y-5 overflow-y-auto border-r border-border bg-surface-0 backdrop-blur-sm pb-4',
        collapsed ? 'px-2' : 'px-6',
        className
      )}
    >
      {/* Header */}
      {collapsed ? (
        <div className='grid grid-cols-3 h-16 items-center relative'>
          <div />
          <div className='justify-self-center'>
            <button
              onClick={() => onNavigate('overview')}
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
          <div className='justify-self-end pr-2'>
            <button
              onClick={onToggleCollapsed}
              className='p-1.5 text-secondary hover:text-primary hover:bg-surface-2 rounded-md transition-colors'
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
              onClick={() => onNavigate('overview')}
              className='focus-visible:outline-none focus-visible:ring-2 ring-accent focus-visible:ring-offset-2 rounded-md'
            >
              <Logo size='md' />
            </button>
          </div>
          <button
            onClick={onToggleCollapsed}
            className='p-1.5 text-secondary hover:text-primary hover:bg-surface-2 rounded-md transition-colors'
            title='Collapse sidebar'
          >
            <ChevronLeftIcon className='h-4 w-4' />
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className='flex flex-1 flex-col'>
        <ul role='list' className='flex flex-1 flex-col gap-y-7'>
          {/* Main Navigation */}
          <li>
            <ul role='list' className='-mx-2 space-y-1'>
              {navigation.map(item => (
                <li key={item.name}>
                  <DashboardNavItem
                    label={item.name}
                    icon={item.icon}
                    isActive={currentNavItem === item.id}
                    isPro={item.isPro}
                    onClick={() => onNavigate(item.id)}
                    collapsed={collapsed}
                  />
                </li>
              ))}
            </ul>
          </li>

          {/* Profile Selector */}
          {!collapsed && creatorProfiles.length > 1 && (
            <li>
              <div className='text-xs font-semibold leading-6 text-secondary'>
                Profiles
              </div>
              <ul role='list' className='-mx-2 mt-2 space-y-1'>
                {creatorProfiles.map(profile => (
                  <li key={profile.id}>
                    <DashboardButton
                      variant='nav-item'
                      isActive={selectedProfileId === profile.id}
                      onClick={() => onProfileSelection(profile.id)}
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
                        <div className='h-6 w-6 rounded-full bg-surface-2 flex items-center justify-center'>
                          <span className='text-xs font-medium text-secondary'>
                            {(profile.displayName || profile.username || 'U')
                              .charAt(0)
                              .toUpperCase()}
                          </span>
                        </div>
                      )}
                      <span className='truncate'>
                        {profile.displayName || profile.username}
                      </span>
                    </DashboardButton>
                  </li>
                ))}
                <li>
                  <DashboardButton
                    variant='nav-item'
                    onClick={() => router.push('/onboarding')}
                    className='border border-dashed border-border'
                  >
                    <svg
                      className='h-6 w-6 shrink-0 text-secondary group-hover:text-primary'
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
                  </DashboardButton>
                </li>
              </ul>
            </li>
          )}

          {/* Footer */}
          <li className='mt-auto'>
            {/* Pro Upgrade */}
            {!collapsed && (
              <div className='mb-4'>
                <DashboardButton
                  variant='pro-upgrade'
                  onClick={() => router.push('/pricing')}
                  className='w-full'
                >
                  <svg
                    className='h-4 w-4 flex-shrink-0'
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
                </DashboardButton>
              </div>
            )}

            {/* Theme toggle and user info */}
            <div className='pt-4 border-t border-border space-y-2'>
              <div className='flex justify-center'>
                <EnhancedThemeToggle variant='compact' />
              </div>
              <div className={cn('flex', collapsed ? 'justify-center' : '')}>
                {!collapsed && artist ? (
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
  );
}
