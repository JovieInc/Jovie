'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import { Button, CommonDropdown } from '@jovie/ui';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/atoms/Avatar';
import { Icon } from '@/components/atoms/Icon';
import { FeedbackModal } from '@/components/dashboard/molecules/FeedbackModal';
import { Badge } from '@/components/ui/Badge';
import { useKeyboardShortcutsSafe } from '@/contexts/KeyboardShortcutsContext';
import { cn } from '@/lib/utils';
import type { UserButtonProps } from './types';
import { useUserButton } from './useUserButton';

interface BuildDropdownItemsParams {
  billingStatus: {
    loading: boolean;
    isPro: boolean;
  };
  loading: {
    manageBilling: boolean;
    upgrade: boolean;
    signOut: boolean;
  };
  userImageUrl: string | undefined;
  displayName: string;
  userInitials: string;
  formattedUsername: string | null;
  handleProfile: () => void;
  handleSettings: () => void;
  handleManageBilling: () => void;
  handleUpgrade: () => void;
  handleSignOut: () => void;
  setIsFeedbackOpen: (open: boolean) => void;
  handleOpenShortcuts?: () => void;
}

function buildDropdownItems({
  billingStatus,
  loading,
  userImageUrl,
  displayName,
  userInitials,
  formattedUsername,
  handleProfile,
  handleSettings,
  handleManageBilling,
  handleUpgrade,
  handleSignOut,
  setIsFeedbackOpen,
  handleOpenShortcuts,
}: BuildDropdownItemsParams): CommonDropdownItem[] {
  const items: CommonDropdownItem[] = [
    // Profile card
    {
      type: 'custom',
      id: 'profile-card',
      render: () => (
        <button
          type='button'
          onClick={handleProfile}
          className='w-full cursor-pointer rounded-lg px-3 py-2 hover:bg-[#f2f2f2] dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-0 text-left'
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
                <span className='truncate text-sm font-medium text-primary-token'>
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
                <p className='truncate text-xs text-tertiary-token mt-0.5'>
                  {formattedUsername}
                </p>
              )}
            </div>
            <Icon
              name='ExternalLink'
              className='h-4 w-4 shrink-0 text-tertiary-token'
              aria-hidden='true'
            />
          </div>
        </button>
      ),
    },
    { type: 'custom', id: 'spacer-1', render: () => <div className='h-2' /> },
    {
      type: 'action',
      id: 'settings',
      label: 'Settings',
      icon: (
        <Icon
          name='Settings'
          className='h-4 w-4 text-tertiary-token group-hover:text-secondary-token transition-colors'
        />
      ),
      onClick: handleSettings,
    },
  ];

  // Add keyboard shortcuts item if handler is provided
  if (handleOpenShortcuts) {
    items.push({
      type: 'action',
      id: 'keyboard-shortcuts',
      label: 'Keyboard shortcuts',
      icon: (
        <Icon
          name='Keyboard'
          className='h-4 w-4 text-tertiary-token group-hover:text-secondary-token transition-colors'
        />
      ),
      onClick: handleOpenShortcuts,
      shortcut: '⌘ /',
    });
  }

  // Add billing item based on status
  if (billingStatus.loading) {
    items.push({
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
    items.push({
      type: 'action',
      id: 'manage-billing',
      label: loading.manageBilling ? 'Opening…' : 'Manage billing',
      icon: (
        <Icon
          name='CreditCard'
          className='h-4 w-4 text-tertiary-token group-hover:text-secondary-token transition-colors'
        />
      ),
      onClick: handleManageBilling,
      disabled: loading.manageBilling,
      className: 'disabled:cursor-not-allowed disabled:opacity-70',
    });
  } else {
    items.push({
      type: 'action',
      id: 'upgrade',
      label: loading.upgrade ? 'Opening…' : 'Upgrade to Pro',
      icon: (
        <Icon
          name='Sparkles'
          className='h-4 w-4 text-tertiary-token group-hover:text-secondary-token transition-colors'
        />
      ),
      onClick: handleUpgrade,
      disabled: loading.upgrade,
      className: 'disabled:cursor-not-allowed disabled:opacity-70',
    });
  }

  // Add feedback and sign out
  items.push(
    {
      type: 'action',
      id: 'feedback',
      label: 'Send feedback',
      icon: (
        <Icon
          name='MessageSquare'
          className='h-4 w-4 text-tertiary-token group-hover:text-secondary-token transition-colors'
        />
      ),
      onClick: () => setIsFeedbackOpen(true),
    },
    { type: 'custom', id: 'spacer-2', render: () => <div className='h-2' /> },
    {
      type: 'action',
      id: 'sign-out',
      label: loading.signOut ? 'Signing out…' : 'Sign out',
      icon: <Icon name='LogOut' className='h-4 w-4 text-red-500' />,
      onClick: handleSignOut,
      disabled: loading.signOut,
      variant: 'destructive',
      className: 'disabled:cursor-not-allowed disabled:opacity-60',
    }
  );

  return items;
}

export function UserButton({
  artist,
  profileHref,
  settingsHref,
  showUserInfo = false,
}: UserButtonProps) {
  const router = useRouter();
  const keyboardShortcuts = useKeyboardShortcutsSafe();
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

  const dropdownItems = buildDropdownItems({
    billingStatus,
    loading,
    userImageUrl,
    displayName,
    userInitials,
    formattedUsername,
    handleProfile,
    handleSettings,
    handleManageBilling,
    handleUpgrade,
    handleSignOut,
    setIsFeedbackOpen,
    handleOpenShortcuts: keyboardShortcuts?.open,
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
      />
      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
      />
    </>
  );
}
