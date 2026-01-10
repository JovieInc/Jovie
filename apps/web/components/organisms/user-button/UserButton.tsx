'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/atoms/Avatar';
import { Icon } from '@/components/atoms/Icon';
import { FeedbackModal } from '@/components/dashboard/molecules/FeedbackModal';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import type { UserButtonProps } from './types';
import { useUserButton } from './useUserButton';

export function UserButton({
  artist,
  profileHref,
  settingsHref,
  showUserInfo = false,
}: UserButtonProps) {
  const router = useRouter();
  const {
    isLoaded,
    user,
    isMenuOpen,
    setIsMenuOpen,
    isFeedbackOpen,
    setIsFeedbackOpen,
    billingStatus,
    userInfo,
    menuActions,
  } = useUserButton({ artist, profileHref, settingsHref });

  const {
    handleManageBilling,
    handleProfile,
    handleSettings,
    handleSignOut,
    handleUpgrade,
    loading,
  } = menuActions;

  const { userImageUrl, displayName, userInitials, formattedUsername } =
    userInfo;

  // Handle loading state
  if (!isLoaded || !user) {
    return showUserInfo ? (
      <div className='flex w-full items-center gap-3 rounded-md border border-subtle bg-surface-1 px-3 py-2'>
        <div className='h-8 w-8 shrink-0 rounded-full bg-surface-2 animate-pulse motion-reduce:animate-none' />
        <div className='flex-1 space-y-1'>
          <div className='h-4 w-24 rounded-sm bg-surface-2 animate-pulse motion-reduce:animate-none' />
          <div className='h-3 w-16 rounded-sm bg-surface-2/80 animate-pulse motion-reduce:animate-none' />
        </div>
      </div>
    ) : (
      <div className='h-10 w-10 shrink-0 rounded-full bg-surface-2 animate-pulse motion-reduce:animate-none' />
    );
  }

  // Fallback if user failed to load but Clerk is ready
  if (!user) {
    return (
      <Button
        variant='ghost'
        size={showUserInfo ? 'default' : 'icon'}
        className={cn(
          'w-full justify-start gap-3 rounded-md border border-subtle bg-surface-1 hover:bg-surface-2',
          !showUserInfo && 'h-10 w-10 justify-center'
        )}
        onClick={() => {
          router.push('/signin');
        }}
      >
        <Avatar
          name='User'
          alt='User avatar'
          size={showUserInfo ? 'sm' : 'xs'}
        />
        {showUserInfo && (
          <div className='flex flex-1 items-center justify-between'>
            <span className='text-sm font-medium'>Sign in</span>
            <Icon name='ChevronRight' className='h-4 w-4 text-tertiary-token' />
          </div>
        )}
      </Button>
    );
  }

  return (
    <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
      <DropdownMenuTrigger asChild>
        {showUserInfo ? (
          <button
            type='button'
            className={cn(
              'flex w-full items-center gap-3 rounded-md border border-sidebar-border bg-sidebar-surface px-3 py-2 text-left transition-colors hover:bg-sidebar-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring/40'
            )}
            onClick={() => setIsMenuOpen(true)}
          >
            <Avatar
              src={userImageUrl}
              alt={displayName || 'User avatar'}
              name={displayName || userInitials}
              size='sm'
              className='shrink-0'
            />
            <div className='min-w-0 flex-1'>
              <div className='flex items-center gap-2 truncate'>
                <p className='text-sm font-medium truncate'>{displayName}</p>
              </div>
            </div>
            <Icon
              name='ChevronRight'
              className='w-4 h-4 text-tertiary-token'
              aria-hidden='true'
            />
          </button>
        ) : (
          <Button
            variant='ghost'
            size='icon'
            className='h-10 w-10 rounded-full border border-sidebar-border bg-sidebar-surface hover:bg-sidebar-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring/40'
            onClick={() => setIsMenuOpen(true)}
          >
            <Avatar
              src={userImageUrl}
              alt={displayName || 'User avatar'}
              name={displayName || userInitials}
              size='xs'
              className='h-5 w-5 shrink-0 ring-0 shadow-none'
            />
            <span className='sr-only'>Open user menu</span>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        className='w-[calc(var(--radix-dropdown-menu-trigger-width)+16px)] min-w-[calc(var(--radix-dropdown-menu-trigger-width)+16px)] rounded-xl border border-sidebar-border bg-sidebar-surface p-2 font-sans text-[13px] leading-[18px] text-sidebar-foreground shadow-md backdrop-blur-none'
      >
        <DropdownMenuItem
          onSelect={handleProfile}
          className='cursor-pointer rounded-lg px-2 py-2 hover:bg-sidebar-surface-hover focus-visible:bg-sidebar-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring/40'
        >
          <div className='flex w-full items-center gap-3'>
            <Avatar
              src={userImageUrl}
              alt={displayName || 'User avatar'}
              name={displayName || userInitials}
              size='sm'
              className='shrink-0'
            />
            <div className='min-w-0 flex-1'>
              <div className='flex items-center gap-2'>
                <span className='truncate text-sm font-medium text-sidebar-foreground'>
                  {displayName}
                </span>
                {billingStatus.isPro && (
                  <Badge
                    variant='secondary'
                    size='sm'
                    emphasis='subtle'
                    className='shrink-0 rounded-full px-1.5 py-0 text-[10px] font-medium'
                  >
                    Pro
                  </Badge>
                )}
              </div>
              {formattedUsername && (
                <p className='truncate text-xs text-sidebar-muted mt-0.5'>
                  {formattedUsername}
                </p>
              )}
            </div>
            <Icon
              name='ExternalLink'
              className='h-4 w-4 shrink-0 text-sidebar-muted'
              aria-hidden='true'
            />
          </div>
        </DropdownMenuItem>

        <div className='h-2' />

        {/* Primary actions group */}
        <DropdownMenuItem
          onSelect={handleSettings}
          className='group flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-surface-hover focus-visible:bg-sidebar-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring/40'
        >
          <Icon
            name='Settings'
            className='h-4 w-4 text-sidebar-muted group-hover:text-sidebar-foreground transition-colors'
          />
          <span className='flex-1'>Settings</span>
        </DropdownMenuItem>

        {/* Billing - only show for Pro users */}
        {billingStatus.loading ? (
          <DropdownMenuItem
            disabled
            className='cursor-default focus-visible:bg-transparent px-2 py-1.5 text-xs h-8'
          >
            <div className='flex w-full items-center gap-2.5'>
              <div className='h-4 w-4 animate-pulse motion-reduce:animate-none rounded bg-white/10' />
              <div className='h-3 w-20 animate-pulse motion-reduce:animate-none rounded bg-white/10' />
            </div>
          </DropdownMenuItem>
        ) : billingStatus.isPro ? (
          <DropdownMenuItem
            onSelect={handleManageBilling}
            disabled={loading.manageBilling}
            className='group flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-surface-hover focus-visible:bg-sidebar-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring/40 disabled:cursor-not-allowed disabled:opacity-70'
          >
            <Icon
              name='CreditCard'
              className='h-4 w-4 text-sidebar-muted group-hover:text-sidebar-foreground transition-colors'
            />
            <span className='flex-1'>
              {loading.manageBilling ? 'Opening…' : 'Manage billing'}
            </span>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onSelect={handleUpgrade}
            disabled={loading.upgrade}
            className='group flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-surface-hover focus-visible:bg-sidebar-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring/40 disabled:cursor-not-allowed disabled:opacity-70'
          >
            <Icon
              name='Sparkles'
              className='h-4 w-4 text-sidebar-muted group-hover:text-sidebar-foreground transition-colors'
            />
            <span className='flex-1'>
              {loading.upgrade ? 'Opening…' : 'Upgrade to Pro'}
            </span>
          </DropdownMenuItem>
        )}

        {/* Feedback */}
        <DropdownMenuItem
          onSelect={() => {
            setIsFeedbackOpen(true);
          }}
          className='group flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-surface-hover focus-visible:bg-sidebar-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring/40'
        >
          <Icon
            name='MessageSquare'
            className='h-4 w-4 text-sidebar-muted group-hover:text-sidebar-foreground transition-colors'
          />
          <span className='flex-1'>Send feedback</span>
        </DropdownMenuItem>

        <div className='h-2' />

        {/* Sign out - pinned at bottom */}
        <DropdownMenuItem
          onSelect={handleSignOut}
          disabled={loading.signOut}
          className='group flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10 focus-visible:bg-red-500/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring/40 disabled:cursor-not-allowed disabled:opacity-60'
        >
          <Icon name='LogOut' className='h-4 w-4 text-red-400' />
          <span className='flex-1'>
            {loading.signOut ? 'Signing out…' : 'Sign out'}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
      />
    </DropdownMenu>
  );
}
