'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import { Button, CommonDropdown } from '@jovie/ui';
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
      <div className='flex w-full items-center gap-2.5 rounded-md border border-subtle bg-surface-1 px-2.5 py-1.5'>
        <div className='h-6 w-6 shrink-0 rounded-full bg-surface-2 animate-pulse motion-reduce:animate-none' />
        <div className='flex-1 space-y-1'>
          <div className='h-3 w-20 rounded-sm bg-surface-2 animate-pulse motion-reduce:animate-none' />
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
        size={showUserInfo ? 'sm' : 'icon'}
        className={cn(
          'w-full justify-start gap-2.5 rounded-md border border-subtle bg-surface-1 hover:bg-surface-2 px-2.5 py-1.5 h-auto',
          !showUserInfo && 'h-10 w-10 justify-center'
        )}
        onClick={() => {
          router.push('/signin');
        }}
      >
        <Avatar name='User' alt='User avatar' size='xs' />
        {showUserInfo && (
          <div className='flex flex-1 items-center justify-between'>
            <span className='text-xs font-medium'>Sign in</span>
            <Icon
              name='ChevronRight'
              className='h-3.5 w-3.5 text-tertiary-token'
            />
          </div>
        )}
      </Button>
    );
  }

  // Sidebar-specific class overrides for CommonDropdown
  const SIDEBAR_CONTENT_CLASS =
    'w-[calc(var(--radix-dropdown-menu-trigger-width)+16px)] min-w-[calc(var(--radix-dropdown-menu-trigger-width)+16px)] rounded-xl border border-sidebar-border bg-sidebar-surface p-2 font-sans text-[13px] leading-[18px] text-sidebar-foreground shadow-md backdrop-blur-none';

  const SIDEBAR_ITEM_CLASS =
    'group flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-surface-hover data-[highlighted]:bg-sidebar-surface-hover focus-visible:bg-sidebar-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring/40';

  // Build dropdown items
  const dropdownItems: CommonDropdownItem[] = [
    // Profile card (custom item)
    {
      type: 'custom',
      id: 'profile-card',
      render: () => (
        <button
          type='button'
          onClick={handleProfile}
          className='w-full cursor-pointer rounded-lg px-2 py-2 hover:bg-sidebar-surface-hover focus-visible:bg-sidebar-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring/40'
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
        </button>
      ),
    },
    // Spacer
    {
      type: 'custom',
      id: 'spacer-1',
      render: () => <div className='h-2' />,
    },
    // Settings
    {
      type: 'action',
      id: 'settings',
      label: 'Settings',
      icon: (
        <Icon
          name='Settings'
          className='h-4 w-4 text-sidebar-muted group-hover:text-sidebar-foreground transition-colors'
        />
      ),
      onClick: handleSettings,
      className: SIDEBAR_ITEM_CLASS,
    },
  ];

  // Billing item (conditional)
  if (billingStatus.loading) {
    dropdownItems.push({
      type: 'custom',
      id: 'billing-loading',
      render: () => (
        <div className='cursor-default px-2.5 py-2 text-[13px] h-9'>
          <div className='flex w-full items-center gap-2.5'>
            <div className='h-4 w-4 animate-pulse motion-reduce:animate-none rounded bg-white/10' />
            <div className='h-3 w-20 animate-pulse motion-reduce:animate-none rounded bg-white/10' />
          </div>
        </div>
      ),
    });
  } else if (billingStatus.isPro) {
    dropdownItems.push({
      type: 'action',
      id: 'manage-billing',
      label: loading.manageBilling ? 'Opening…' : 'Manage billing',
      icon: (
        <Icon
          name='CreditCard'
          className='h-4 w-4 text-sidebar-muted group-hover:text-sidebar-foreground transition-colors'
        />
      ),
      onClick: handleManageBilling,
      disabled: loading.manageBilling,
      className: cn(
        SIDEBAR_ITEM_CLASS,
        'disabled:cursor-not-allowed disabled:opacity-70'
      ),
    });
  } else {
    dropdownItems.push({
      type: 'action',
      id: 'upgrade',
      label: loading.upgrade ? 'Opening…' : 'Upgrade to Pro',
      icon: (
        <Icon
          name='Sparkles'
          className='h-4 w-4 text-sidebar-muted group-hover:text-sidebar-foreground transition-colors'
        />
      ),
      onClick: handleUpgrade,
      disabled: loading.upgrade,
      className: cn(
        SIDEBAR_ITEM_CLASS,
        'disabled:cursor-not-allowed disabled:opacity-70'
      ),
    });
  }

  // Feedback
  dropdownItems.push({
    type: 'action',
    id: 'feedback',
    label: 'Send feedback',
    icon: (
      <Icon
        name='MessageSquare'
        className='h-4 w-4 text-sidebar-muted group-hover:text-sidebar-foreground transition-colors'
      />
    ),
    onClick: () => setIsFeedbackOpen(true),
    className: SIDEBAR_ITEM_CLASS,
  });

  // Spacer before sign out
  dropdownItems.push({
    type: 'custom',
    id: 'spacer-2',
    render: () => <div className='h-2' />,
  });

  // Sign out
  dropdownItems.push({
    type: 'action',
    id: 'sign-out',
    label: loading.signOut ? 'Signing out…' : 'Sign out',
    icon: <Icon name='LogOut' className='h-4 w-4 text-red-400' />,
    onClick: handleSignOut,
    disabled: loading.signOut,
    className:
      'group flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-red-500 transition-colors hover:bg-red-500/10 data-[highlighted]:bg-red-500/10 focus-visible:bg-red-500/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring/40 disabled:cursor-not-allowed disabled:opacity-60',
  });

  // Custom trigger
  const triggerElement = showUserInfo ? (
    <button
      type='button'
      className='flex w-full items-center gap-2.5 rounded-md border border-sidebar-border bg-sidebar-surface px-2.5 py-1.5 text-left transition-colors hover:bg-sidebar-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring/40'
    >
      <Avatar
        src={userImageUrl}
        alt={displayName || 'User avatar'}
        name={displayName || userInitials}
        size='xs'
        className='shrink-0'
      />
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-2 truncate'>
          <p className='text-xs font-medium truncate'>{displayName}</p>
        </div>
      </div>
      <Icon
        name='ChevronRight'
        className='w-3.5 h-3.5 text-tertiary-token'
        aria-hidden='true'
      />
    </button>
  ) : (
    <Button
      variant='ghost'
      size='icon'
      className='h-10 w-10 rounded-full border border-sidebar-border bg-sidebar-surface hover:bg-sidebar-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring/40'
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
  );

  return (
    <>
      <CommonDropdown
        variant='dropdown'
        items={dropdownItems}
        trigger={triggerElement}
        align='end'
        open={isMenuOpen}
        onOpenChange={setIsMenuOpen}
        contentClassName={SIDEBAR_CONTENT_CLASS}
      />
      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
      />
    </>
  );
}
