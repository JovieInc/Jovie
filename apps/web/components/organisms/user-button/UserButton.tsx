'use client';

import type { CommonDropdownItem, CommonDropdownSubmenu } from '@jovie/ui';
import { Button, CommonDropdown } from '@jovie/ui';
import dynamic from 'next/dynamic';
import { useCallback } from 'react';
import { Badge } from '@/components/atoms/Badge';
import { useKeyboardShortcutsSafe } from '@/contexts/KeyboardShortcutsContext';
import { track } from '@/lib/analytics';
import { Icon } from '../../atoms/Icon';
import { Avatar } from '../../molecules/Avatar/Avatar';
import type { UserButtonProps } from './types';
import { useUserButton } from './useUserButton';

const DashboardFeedbackModal = dynamic(
  () =>
    import('../../dashboard/organisms/DashboardFeedbackModal').then(mod => ({
      default: mod.DashboardFeedbackModal,
    })),
  { ssr: false, loading: () => null }
);

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
          className='w-full cursor-pointer rounded-md px-2 py-1.5 hover:bg-interactive-hover focus-visible:outline-none focus-visible:bg-interactive-hover text-left'
        >
          <div className='flex w-full items-center gap-2.5'>
            <Avatar
              src={userImageUrl}
              alt={displayName || 'User avatar'}
              name={displayName || userInitials}
              size='xs'
              className='shrink-0'
            />
            <div className='min-w-0 flex-1'>
              <div className='flex items-center gap-2'>
                <span className='truncate text-[13px] font-medium text-primary-token'>
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
                <p className='truncate text-[11px] text-tertiary-token mt-0.5'>
                  {formattedUsername}
                </p>
              )}
            </div>
            <Icon
              name='ExternalLink'
              className='h-3.5 w-3.5 shrink-0 text-tertiary-token'
              aria-hidden='true'
            />
          </div>
        </button>
      ),
    },
    { type: 'separator', id: 'sep-1' },
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
      shortcut: 'G S',
    },
  ];

  // Add "Learn More" submenu with keyboard shortcuts and legal links
  const learnMoreItems: CommonDropdownItem[] = [];

  if (handleOpenShortcuts) {
    learnMoreItems.push({
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

  // Add legal page links
  learnMoreItems.push(
    {
      type: 'action',
      id: 'privacy-policy',
      label: 'Privacy Policy',
      icon: (
        <Icon
          name='Shield'
          className='h-4 w-4 text-tertiary-token group-hover:text-secondary-token transition-colors'
        />
      ),
      onClick: () =>
        window.open('/legal/privacy', '_blank', 'noopener,noreferrer'),
    },
    {
      type: 'action',
      id: 'terms-of-service',
      label: 'Terms of Service',
      icon: (
        <Icon
          name='FileText'
          className='h-4 w-4 text-tertiary-token group-hover:text-secondary-token transition-colors'
        />
      ),
      onClick: () =>
        window.open('/legal/terms', '_blank', 'noopener,noreferrer'),
    },
    {
      type: 'action',
      id: 'cookie-policy',
      label: 'Cookie Policy',
      icon: (
        <Icon
          name='Cookie'
          className='h-4 w-4 text-tertiary-token group-hover:text-secondary-token transition-colors'
        />
      ),
      onClick: () =>
        window.open('/legal/cookies', '_blank', 'noopener,noreferrer'),
    }
  );

  const learnMoreSubmenu: CommonDropdownSubmenu = {
    type: 'submenu',
    id: 'learn-more',
    label: 'Learn more',
    icon: (
      <Icon
        name='HelpCircle'
        className='h-4 w-4 text-tertiary-token group-hover:text-secondary-token transition-colors'
      />
    ),
    items: learnMoreItems,
  };
  items.push(learnMoreSubmenu);

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
    { type: 'separator', id: 'sep-2' },
    {
      type: 'action',
      id: 'sign-out',
      label: loading.signOut ? 'Signing out…' : 'Sign out',
      icon: (
        <Icon
          name='LogOut'
          className='h-4 w-4 text-tertiary-token group-hover:text-secondary-token transition-colors'
        />
      ),
      onClick: handleSignOut,
      disabled: loading.signOut,
      className: 'disabled:cursor-not-allowed disabled:opacity-60',
      shortcut: '⌥ ⇧ Q',
    }
  );

  return items;
}

export function UserButton({
  artist,
  profileHref,
  settingsHref,
  showUserInfo = false,
  trigger,
}: UserButtonProps) {
  const keyboardShortcuts = useKeyboardShortcutsSafe();
  const handleFeedbackSubmit = useCallback((feedback: string) => {
    track('feedback_submitted', {
      feedback: feedback.trim(),
      source: 'dashboard_sidebar',
      method: 'custom_modal',
      character_count: feedback.trim().length,
    });
  }, []);
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

  // Handle loading state or no user
  if (!isLoaded || !user) {
    return showUserInfo ? (
      <div className='flex w-full items-center gap-2 rounded-md px-2 py-1'>
        <div className='h-6 w-6 shrink-0 rounded-full bg-sidebar-accent animate-pulse motion-reduce:animate-none' />
        <div className='flex-1'>
          <div className='h-3 w-20 rounded-sm bg-sidebar-accent animate-pulse motion-reduce:animate-none' />
        </div>
      </div>
    ) : (
      <div className='h-10 w-10 shrink-0 rounded-full bg-surface-2 animate-pulse motion-reduce:animate-none' />
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

  // Custom trigger — use provided trigger prop or build default
  const triggerElement =
    trigger ??
    (showUserInfo ? (
      <button
        type='button'
        className='flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring'
      >
        <Avatar
          src={userImageUrl}
          alt={displayName || 'User avatar'}
          name={displayName || userInitials}
          size='xs'
          className='shrink-0'
        />
        <div className='min-w-0 flex-1'>
          <p className='text-[13px] font-normal text-sidebar-item-foreground truncate'>
            {displayName}
          </p>
        </div>
        <Icon
          name='ChevronRight'
          className='w-3 h-3 text-sidebar-item-icon'
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
    ));

  return (
    <>
      <CommonDropdown
        variant='dropdown'
        items={dropdownItems}
        trigger={triggerElement}
        align={trigger ? 'start' : 'end'}
        open={isMenuOpen}
        onOpenChange={setIsMenuOpen}
        contentClassName='w-[220px]'
      />
      <DashboardFeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
        onSubmit={handleFeedbackSubmit}
      />
    </>
  );
}
