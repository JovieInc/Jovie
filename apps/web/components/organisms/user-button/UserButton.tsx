'use client';

import type { CommonDropdownItem, CommonDropdownSubmenu } from '@jovie/ui';
import { Button, CommonDropdown } from '@jovie/ui';
import {
  Cookie,
  CreditCard,
  FileCheck2,
  HelpCircle,
  Keyboard,
  LogOut,
  MessageSquare,
  Monitor,
  Settings,
  Shield,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/atoms/Badge';
import { APP_ROUTES } from '@/constants/routes';
import { useKeyboardShortcutsSafe } from '@/contexts/KeyboardShortcutsContext';
import { track } from '@/lib/analytics';
import { COOKIE_BANNER_REQUIRED_COOKIE } from '@/lib/cookies/consent-regions';
import { useIsElectronRuntime } from '@/lib/desktop/electron-bridge';
import { GLYPH_CMD, GLYPH_OPT, GLYPH_SHIFT } from '@/lib/keyboard-shortcuts';
import { useFeedbackMutation } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { Icon } from '../../atoms/Icon';
import { Avatar } from '../../molecules/Avatar/Avatar';
import type { UserButtonProps } from './types';
import { UsageMenuItem } from './UsageMenuItem';
import { useUserButton } from './useUserButton';

const DashboardFeedbackModal = dynamic(
  () =>
    import('@/features/dashboard/organisms/DashboardFeedbackModal').then(
      mod => ({
        default: mod.DashboardFeedbackModal,
      })
    ),
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
  handleHelp: () => void;
  handleSettings: () => void;
  iosAlphaAccess: {
    hasAccess: boolean;
    installUrl: string | null;
  };
  usageStatsUrl: string;
  handleManageBilling: () => void;
  handleUpgrade: () => void;
  upgradeLabel: string;
  handleSignOut: () => void;
  setIsFeedbackOpen: (open: boolean) => void;
  handleOpenShortcuts?: () => void;
  isElectronRuntime: boolean;
}

const USER_MENU_CONTENT_CLASS = 'w-80 max-w-[calc(100vw-1rem)]';
const USER_MENU_GROUP_SPACER_CLASS = '-mx-1 my-0 h-2 border-0';

function sanitizeInstallUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function buildDropdownItems({
  billingStatus,
  loading,
  userImageUrl,
  displayName,
  userInitials,
  formattedUsername,
  handleProfile,
  handleHelp,
  handleSettings,
  iosAlphaAccess,
  usageStatsUrl,
  handleManageBilling,
  handleUpgrade,
  upgradeLabel,
  handleSignOut,
  setIsFeedbackOpen,
  handleOpenShortcuts,
  isElectronRuntime,
}: BuildDropdownItemsParams): CommonDropdownItem[] {
  const items: CommonDropdownItem[] = [
    {
      type: 'action-row',
      id: 'profile-help',
      className:
        'grid min-h-12 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-1 px-1',
      items: [
        {
          type: 'action',
          id: 'profile-card',
          label: `Open profile for ${displayName}`,
          onClick: handleProfile,
          className: 'min-h-12 min-w-0 gap-2.5 px-1.5 py-1.5',
          content: (
            <>
              <Avatar
                src={userImageUrl}
                alt={displayName || 'User avatar'}
                name={displayName || userInitials}
                size='xs'
                className='shrink-0'
              />
              <div className='min-w-0 flex-1'>
                <div className='flex min-w-0 items-center gap-2'>
                  <span
                    title={displayName}
                    className='min-w-0 flex-1 truncate text-app font-medium text-primary-token'
                  >
                    {displayName}
                  </span>
                  {billingStatus.isPro && (
                    <Badge
                      variant='secondary'
                      size='sm'
                      className='shrink-0 rounded-full px-1.5 py-0 text-3xs font-medium'
                    >
                      Pro
                    </Badge>
                  )}
                </div>
                <p
                  aria-hidden={formattedUsername ? undefined : true}
                  className='mt-0.5 h-4 truncate text-2xs text-tertiary-token'
                >
                  {formattedUsername ?? '\u00A0'}
                </p>
              </div>
            </>
          ),
        },
        {
          type: 'action',
          id: 'help',
          label: 'Help',
          icon: HelpCircle,
          onClick: handleHelp,
          className: 'min-h-8 shrink-0 px-2',
        },
      ],
    },
    {
      type: 'separator',
      id: 'sep-1',
      className: USER_MENU_GROUP_SPACER_CLASS,
    },
    {
      type: 'action',
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      onClick: handleSettings,
      shortcut: 'G S',
    },
    {
      type: 'custom',
      id: 'usage-menu',
      render: () => (
        <UsageMenuItem
          usageStatsUrl={usageStatsUrl}
          onUpgrade={handleUpgrade}
          upgradeLabel={upgradeLabel}
          isUpgradeLoading={loading.upgrade}
        />
      ),
    },
  ];

  if (iosAlphaAccess.hasAccess) {
    items.push({
      type: 'action',
      id: 'download-ios',
      label: 'Install iOS Alpha',
      icon: Smartphone,
      onClick: () => {
        const href =
          sanitizeInstallUrl(iosAlphaAccess.installUrl) ?? APP_ROUTES.DOWNLOAD;
        window.open(href, '_blank', 'noopener,noreferrer');
      },
    });
  }

  if (!isElectronRuntime) {
    items.push({
      type: 'action' as const,
      id: 'download-desktop',
      label: 'Download Desktop App',
      icon: Monitor,
      onClick: () => {
        window.open(APP_ROUTES.DOWNLOAD, '_blank', 'noopener,noreferrer');
      },
    });
  }

  // Add "Learn More" submenu with keyboard shortcuts and legal links
  const learnMoreItems: CommonDropdownItem[] = [];

  if (handleOpenShortcuts) {
    learnMoreItems.push({
      type: 'action',
      id: 'keyboard-shortcuts',
      label: 'Keyboard Shortcuts',
      icon: Keyboard,
      onClick: handleOpenShortcuts,
      shortcut: `${GLYPH_CMD} /`,
    });
  }

  // Add legal page links
  learnMoreItems.push(
    {
      type: 'action',
      id: 'privacy-policy',
      label: 'Privacy Policy',
      icon: Shield,
      onClick: () =>
        window.open(APP_ROUTES.LEGAL_PRIVACY, '_blank', 'noopener,noreferrer'),
    },
    {
      type: 'action',
      id: 'terms-of-service',
      label: 'Terms Of Service',
      icon: FileCheck2,
      onClick: () =>
        window.open(APP_ROUTES.LEGAL_TERMS, '_blank', 'noopener,noreferrer'),
    },
    {
      type: 'action',
      id: 'cookie-policy',
      label: 'Cookie Policy',
      icon: Cookie,
      onClick: () =>
        window.open(APP_ROUTES.LEGAL_COOKIES, '_blank', 'noopener,noreferrer'),
    }
  );

  // Only show Cookie Settings in GDPR-regulated regions, matching footer behavior
  const ccRequired =
    typeof document === 'undefined'
      ? undefined
      : document.cookie
          .split(';')
          .find(c => c.trim().startsWith(`${COOKIE_BANNER_REQUIRED_COOKIE}=`));
  if (ccRequired && ccRequired.split('=')[1]?.trim() !== '0') {
    learnMoreItems.push({
      type: 'action',
      id: 'cookie-settings',
      label: 'Cookie Settings',
      icon: Settings,
      onClick: () =>
        globalThis.dispatchEvent(new CustomEvent('jv:cookie:open')),
    });
  }

  const learnMoreSubmenu: CommonDropdownSubmenu = {
    type: 'submenu',
    id: 'learn-more',
    label: 'Learn More',
    icon: HelpCircle,
    items: learnMoreItems,
  };
  items.push(learnMoreSubmenu);

  // Add billing item based on status
  if (billingStatus.loading) {
    items.push({
      type: 'custom',
      id: 'billing-loading',
      render: () => (
        <div className='cursor-default px-2.5 py-2 text-app h-9'>
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
      icon: CreditCard,
      onClick: handleManageBilling,
      disabled: loading.manageBilling,
      className: 'disabled:cursor-not-allowed disabled:opacity-70',
    });
  } else {
    items.push({
      type: 'action',
      id: 'upgrade',
      label: loading.upgrade ? 'Opening…' : upgradeLabel,
      icon: Sparkles,
      onClick: handleUpgrade,
      disabled: loading.upgrade,
      className: 'disabled:cursor-not-allowed disabled:opacity-70',
    });
  }

  // Add feedback, version info, and sign out.
  // Version is now shown to all users (moved from admin-only sidebar footer).
  items.push(
    {
      type: 'separator',
      id: 'sep-support',
      className: USER_MENU_GROUP_SPACER_CLASS,
    },
    {
      type: 'action',
      id: 'feedback',
      label: 'Send Feedback',
      icon: MessageSquare,
      onClick: () => setIsFeedbackOpen(true),
    },
    {
      type: 'separator',
      id: 'sep-2',
      className: USER_MENU_GROUP_SPACER_CLASS,
    },
    {
      type: 'custom',
      id: 'version',
      render: () => (
        <div className='flex min-h-8 items-center px-2.5 py-1.5 text-2xs leading-4 text-tertiary-token select-none'>
          Version {process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'}
          {process.env.NEXT_PUBLIC_BUILD_SHA
            ? ` (${process.env.NEXT_PUBLIC_BUILD_SHA})`
            : ''}
        </div>
      ),
    },
    {
      type: 'separator',
      id: 'sep-signout',
      className: USER_MENU_GROUP_SPACER_CLASS,
    },
    {
      type: 'action',
      id: 'sign-out',
      label: loading.signOut ? 'Signing out…' : 'Sign out',
      icon: LogOut,
      onClick: handleSignOut,
      disabled: loading.signOut,
      className: 'disabled:cursor-not-allowed disabled:opacity-60',
      shortcut: `${GLYPH_OPT} ${GLYPH_SHIFT} Q`,
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
  const isElectronRuntime = useIsElectronRuntime();
  const { mutateAsync: submitFeedback } = useFeedbackMutation();
  const [iosAlphaAccess, setIOSAlphaAccess] = useState<{
    hasAccess: boolean;
    installUrl: string | null;
  }>({
    hasAccess: false,
    installUrl: null,
  });
  const handleFeedbackSubmit = useCallback(
    async (feedback: string) => {
      const trimmedFeedback = feedback.trim();

      await submitFeedback({
        message: trimmedFeedback,
        source: 'dashboard_sidebar',
        pathname:
          globalThis.window === undefined ? null : globalThis.location.pathname,
      });

      track('feedback_submitted', {
        feedback: trimmedFeedback,
        source: 'dashboard_sidebar',
        method: 'custom_modal',
        character_count: trimmedFeedback.length,
      });
    },
    [submitFeedback]
  );
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

  const handleHelp = useCallback(() => {
    window.open(APP_ROUTES.SUPPORT, '_blank', 'noopener,noreferrer');
    setIsMenuOpen(false);
  }, [setIsMenuOpen]);

  useEffect(() => {
    if (!isElectronRuntime || !isLoaded || !user) {
      setIOSAlphaAccess({ hasAccess: false, installUrl: null });
      return;
    }

    let isActive = true;

    async function loadIOSAlphaAccess() {
      try {
        const response = await fetch('/api/mobile/v1/ios-access', {
          cache: 'no-store',
        });
        if (!response.ok) {
          if (isActive) {
            setIOSAlphaAccess({ hasAccess: false, installUrl: null });
          }
          return;
        }

        const payload = (await response.json()) as {
          hasAccess?: unknown;
          installUrl?: unknown;
        };
        if (!isActive) return;

        setIOSAlphaAccess({
          hasAccess: payload.hasAccess === true,
          installUrl: sanitizeInstallUrl(payload.installUrl),
        });
      } catch {
        if (isActive) {
          setIOSAlphaAccess({ hasAccess: false, installUrl: null });
        }
      }
    }

    void loadIOSAlphaAccess();

    return () => {
      isActive = false;
    };
  }, [isElectronRuntime, isLoaded, user]);

  // Handle loading state or no user
  if (!isLoaded || !user) {
    if (trigger) {
      return (
        <div data-testid='user-button-loading' className='contents'>
          <CommonDropdown
            variant='dropdown'
            items={[]}
            trigger={trigger}
            align='start'
            open={isMenuOpen}
            onOpenChange={setIsMenuOpen}
            disabled
            contentClassName={USER_MENU_CONTENT_CLASS}
          />
        </div>
      );
    }

    return showUserInfo ? (
      <div
        data-testid='user-button-loading'
        className='flex w-full items-center gap-2 rounded-md px-2 py-1 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-7 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:p-0'
      >
        <div className='h-6 w-6 shrink-0 rounded-full bg-sidebar-accent animate-pulse motion-reduce:animate-none' />
        <div
          data-user-button-loading-copy
          className='flex-1 group-data-[collapsible=icon]:hidden'
        >
          <div className='h-3 w-20 rounded-sm bg-sidebar-accent animate-pulse motion-reduce:animate-none' />
        </div>
      </div>
    ) : (
      <div
        data-testid='user-button-loading'
        className='h-10 w-10 shrink-0 rounded-full bg-surface-2 animate-pulse motion-reduce:animate-none'
      />
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
    handleHelp,
    handleSettings,
    iosAlphaAccess,
    usageStatsUrl: APP_ROUTES.SETTINGS_USAGE,
    handleManageBilling,
    handleUpgrade,
    upgradeLabel: menuActions.upgradeLabel,
    handleSignOut,
    setIsFeedbackOpen,
    handleOpenShortcuts: keyboardShortcuts?.open,
    isElectronRuntime,
  });

  // Custom trigger — use provided trigger prop or build default
  const triggerElement =
    trigger ??
    (showUserInfo ? (
      <button
        type='button'
        className='group/user-button flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-7 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:p-0'
      >
        <Avatar
          src={userImageUrl}
          alt={displayName || 'User avatar'}
          name={displayName || userInitials}
          size='xs'
          className='shrink-0'
        />
        <div
          data-user-button-display-name
          className='min-w-0 flex-1 group-data-[collapsible=icon]:hidden'
        >
          <p
            title={displayName}
            className='truncate text-app font-normal text-sidebar-item-foreground'
          >
            {displayName}
          </p>
        </div>
        <Icon
          name='ChevronRight'
          data-user-button-chevron
          className={cn(
            'size-3 text-sidebar-item-icon transition-opacity duration-subtle group-data-[collapsible=icon]:hidden',
            isMenuOpen
              ? 'opacity-100'
              : 'opacity-0 group-hover/user-button:opacity-100 group-focus-visible/user-button:opacity-100'
          )}
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
    <div data-testid='user-button-loaded' className='contents'>
      <CommonDropdown
        variant='dropdown'
        items={dropdownItems}
        trigger={triggerElement}
        align={trigger || showUserInfo ? 'start' : 'end'}
        open={isMenuOpen}
        onOpenChange={setIsMenuOpen}
        contentClassName={USER_MENU_CONTENT_CLASS}
      />
      <DashboardFeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
        onSubmit={handleFeedbackSubmit}
      />
    </div>
  );
}
