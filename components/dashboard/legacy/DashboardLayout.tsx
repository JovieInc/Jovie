import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  TransitionChild,
} from '@headlessui/react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import React, { useState } from 'react';
import { UserButton } from '@/components/molecules/UserButton';
import { Logo } from '@/components/ui/Logo';
import type { CreatorProfile } from '@/lib/db/schema';
import { cn } from '@/lib/utils';
import type { Artist } from '@/types/db';
import { EnhancedThemeToggle } from '../molecules/EnhancedThemeToggle';
import { DashboardNavItem } from './DashboardNavItem';
import { DashboardSidebar } from './DashboardSidebar';

interface NavigationItem {
  name: string;
  id: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  isPro?: boolean;
}

interface DashboardLayoutProps {
  navigation: NavigationItem[];
  currentNavItem: string;
  onNavigate: (navId: string) => void;
  artist: Artist;
  creatorProfiles: CreatorProfile[];
  selectedProfileId: string | null;
  onProfileSelection: (profileId: string) => void;
  children: React.ReactNode;
  loading?: boolean;
}

export function DashboardLayout({
  navigation,
  currentNavItem,
  onNavigate,
  artist,
  creatorProfiles,
  selectedProfileId,
  onProfileSelection,
  children,
  loading = false,
}: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Loading screen with app icon
  if (loading) {
    return (
      <div className='min-h-screen bg-base flex items-center justify-center'>
        <div className='text-center'>
          <Logo size='lg' className='mx-auto mb-4' />
          <div className='animate-pulse'>
            <div className='h-2 bg-surface-2 rounded w-32 mx-auto'></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-base transition-colors relative'>
      {/* Background patterns */}
      <div className='absolute inset-0 opacity-50 grid-bg dark:grid-bg-dark pointer-events-none' />
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

            {/* Mobile Sidebar Content */}
            <div className='flex grow flex-col gap-y-5 overflow-y-auto bg-surface-0 backdrop-blur-sm px-6 pb-4 border-r border-subtle'>
              <div className='flex h-16 shrink-0 items-center'>
                <button
                  onClick={() => {
                    onNavigate('overview');
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
                          <DashboardNavItem
                            label={item.name}
                            icon={item.icon}
                            isActive={currentNavItem === item.id}
                            isPro={item.isPro}
                            onClick={() => {
                              onNavigate(item.id);
                              setSidebarOpen(false);
                            }}
                          />
                        </li>
                      ))}
                    </ul>
                  </li>

                  {/* Mobile profile selector */}
                  {creatorProfiles.length > 1 && (
                    <li>
                      <div className='text-xs font-semibold leading-6 text-secondary'>
                        Profiles
                      </div>
                      <ul role='list' className='-mx-2 mt-2 space-y-1'>
                        {creatorProfiles.map(profile => (
                          <li key={profile.id}>
                            <DashboardNavItem
                              label={profile.displayName || profile.username}
                              icon={() => (
                                <div className='h-6 w-6 rounded-full bg-surface-2 flex items-center justify-center'>
                                  <span className='text-xs font-medium text-secondary'>
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
                              isActive={selectedProfileId === profile.id}
                              onClick={() => onProfileSelection(profile.id)}
                            />
                          </li>
                        ))}
                      </ul>
                    </li>
                  )}
                </ul>

                {/* Mobile footer */}
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

      {/* Desktop sidebar */}
      <div
        className={cn(
          'hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:flex-col transition-all duration-300 ease-in-out',
          sidebarCollapsed ? 'lg:w-16' : 'lg:w-72'
        )}
      >
        <DashboardSidebar
          navigation={navigation}
          currentNavItem={currentNavItem}
          onNavigate={onNavigate}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed(!sidebarCollapsed)}
          artist={artist}
          creatorProfiles={creatorProfiles}
          selectedProfileId={selectedProfileId}
          onProfileSelection={onProfileSelection}
        />
      </div>

      {/* Main content area */}
      <div
        className={cn(
          'transition-all duration-300 ease-in-out',
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-72'
        )}
      >
        {/* Mobile header bar */}
        <div className='sticky top-0 z-40 lg:hidden flex h-12 shrink-0 items-center gap-x-4 bg-surface-0/95 backdrop-blur-md px-4 border-b border-subtle'>
          <button
            type='button'
            className='-m-2.5 p-2.5 text-secondary'
            onClick={() => setSidebarOpen(true)}
          >
            <span className='sr-only'>Open sidebar</span>
            <Bars3Icon className='h-5 w-5 text-secondary' aria-hidden='true' />
          </button>
        </div>

        {/* Page content */}
        <main className='py-10'>
          <div className='px-4 sm:px-6 lg:px-8'>{children}</div>
        </main>
      </div>
    </div>
  );
}
