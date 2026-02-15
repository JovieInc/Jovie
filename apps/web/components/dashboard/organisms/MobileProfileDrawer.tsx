'use client';

import { Sheet, SheetContent, SheetTitle } from '@jovie/ui';
import { LogOut, Settings, User } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Avatar } from '@/components/molecules/Avatar';
import { useUserButton } from '@/components/organisms/user-button';
import { APP_ROUTES } from '@/constants/routes';
import { cn } from '@/lib/utils';

export interface MobileProfileDrawerProps {
  readonly profileHref?: string;
}

/**
 * MobileProfileDrawer – right-side sheet drawer for mobile profile access.
 *
 * Renders an avatar trigger button (for the header) and a Sheet that slides
 * in from the right showing the user profile card and key actions.
 */
export function MobileProfileDrawer({ profileHref }: MobileProfileDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { isLoaded, user, userInfo, menuActions, billingStatus } =
    useUserButton({
      profileHref,
      settingsHref: APP_ROUTES.SETTINGS,
    });

  const { userImageUrl, displayName, userInitials, formattedUsername } =
    userInfo;
  const { handleSettings, handleSignOut, loading } = menuActions;

  if (!isLoaded || !user) {
    return (
      <div className='h-8 w-8 shrink-0 rounded-full bg-surface-2 animate-pulse motion-reduce:animate-none lg:hidden' />
    );
  }

  return (
    <>
      {/* Trigger – avatar button shown in the mobile header */}
      <button
        type='button'
        aria-label='Open profile menu'
        onClick={() => setIsOpen(true)}
        className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ring-default transition-opacity hover:opacity-80 active:scale-95 lg:hidden'
      >
        <Avatar
          src={userImageUrl}
          alt={displayName || 'Profile'}
          name={displayName || userInitials}
          size='xs'
          className='h-7 w-7 shrink-0'
        />
      </button>

      {/* Right drawer sheet */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          side='right'
          className='flex flex-col gap-0 p-0 w-[280px]'
          hideClose
        >
          <SheetTitle className='sr-only'>Profile menu</SheetTitle>

          {/* Profile card */}
          <div className='px-5 pt-6 pb-4'>
            <div className='flex items-center gap-3'>
              <Avatar
                src={userImageUrl}
                alt={displayName || 'Profile'}
                name={displayName || userInitials}
                size='lg'
                className='h-11 w-11 shrink-0'
              />
              <div className='min-w-0'>
                <p className='truncate text-sm font-semibold text-primary-token'>
                  {displayName}
                </p>
                {formattedUsername ? (
                  <p className='truncate text-xs text-secondary-token'>
                    {formattedUsername}
                  </p>
                ) : null}
                {billingStatus.isPro && (
                  <span className='mt-1 inline-block rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-secondary-token'>
                    Pro
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className='mx-4 border-t border-subtle' />

          {/* Navigation links */}
          <nav aria-label='Profile navigation' className='flex-1 px-2 py-2'>
            {profileHref ? (
              <Link
                href={profileHref}
                target='_blank'
                rel='noopener noreferrer'
                onClick={() => setIsOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                  'text-secondary-token hover:bg-surface-2 hover:text-primary-token',
                  'transition-colors active:scale-[0.98]'
                )}
              >
                <User className='size-4 text-tertiary-token' aria-hidden />
                View profile
              </Link>
            ) : null}

            <button
              type='button'
              onClick={() => {
                setIsOpen(false);
                // Allow sheet to begin closing before navigation
                setTimeout(handleSettings, 150);
              }}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                'text-secondary-token hover:bg-surface-2 hover:text-primary-token',
                'transition-colors active:scale-[0.98]'
              )}
            >
              <Settings className='size-4 text-tertiary-token' aria-hidden />
              Settings
            </button>
          </nav>

          {/* Footer: Sign out */}
          <div className='mt-auto border-t border-subtle px-2 py-2'>
            <button
              type='button'
              onClick={() => {
                setIsOpen(false);
                handleSignOut();
              }}
              disabled={loading.signOut}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                'text-secondary-token hover:bg-surface-2 hover:text-primary-token',
                'transition-colors active:scale-[0.98]',
                'disabled:cursor-not-allowed disabled:opacity-60'
              )}
            >
              <LogOut className='size-4 text-tertiary-token' aria-hidden />
              {loading.signOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
