'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { APP_ROUTES, isDemoRoutePath } from '@/constants/routes';
import { useAuthSafe, useUserSafe } from '@/hooks/useClerkSafe';
import { env } from '@/lib/env-client';
import { useBillingStatusQuery } from '@/lib/queries';
import { upgradeOAuthAvatarUrl } from '@/lib/utils/avatar-url';
import type { Artist } from '@/types/db';
import { useUserMenuActions } from '../useUserMenuActions';
import type { UserDisplayInfo } from './types';

const BILLING_STATUS_ERROR_TOAST_SESSION_KEY =
  'jovie:billing-status-error-toast-shown';

export interface UseUserButtonProps {
  readonly artist?: Artist | null;
  readonly profileHref?: string;
  readonly settingsHref?: string;
}

/** Normalized billing status shape for consumers */
export interface BillingStatus {
  isPro: boolean;
  plan: string | null;
  hasStripeCustomer: boolean;
  loading: boolean;
  error: string | null;
}

export interface UseUserButtonReturn {
  isLoaded: boolean;
  user: ReturnType<typeof useUserSafe>['user'];
  isMenuOpen: boolean;
  setIsMenuOpen: (open: boolean) => void;
  isFeedbackOpen: boolean;
  setIsFeedbackOpen: (open: boolean) => void;
  billingStatus: BillingStatus;
  userInfo: UserDisplayInfo;
  menuActions: ReturnType<typeof useUserMenuActions>;
}

function isRoutePath(pathname: string | null | undefined, route: string) {
  return (
    typeof pathname === 'string' &&
    (pathname === route || pathname.startsWith(`${route}/`))
  );
}

function isBillingOwnedSurface(pathname: string | null | undefined) {
  return (
    isRoutePath(pathname, APP_ROUTES.BILLING) ||
    isRoutePath(pathname, APP_ROUTES.SETTINGS_BILLING)
  );
}

function getBillingStatusErrorToastSessionKey(
  userId: string | null | undefined
) {
  return userId
    ? `${BILLING_STATUS_ERROR_TOAST_SESSION_KEY}:${userId}`
    : BILLING_STATUS_ERROR_TOAST_SESSION_KEY;
}

function hasNotifiedBillingErrorThisSession(storageKey: string) {
  if (typeof window === 'undefined') return true;

  try {
    return window.sessionStorage.getItem(storageKey) === 'true';
  } catch {
    return false;
  }
}

function markBillingErrorNotifiedThisSession(storageKey: string) {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(storageKey, 'true');
  } catch {
    // Storage can be unavailable in private browsing or constrained test envs.
  }
}

export function useUserButton({
  artist,
  profileHref,
  settingsHref,
}: UseUserButtonProps): UseUserButtonReturn {
  const pathname = usePathname();
  const { isLoaded, user } = useUserSafe();
  const { signOut } = useAuthSafe();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const isPassiveRuntime = env.IS_E2E;
  const isDemoRoute = isDemoRoutePath(pathname);
  const billingStatusErrorToastSessionKey =
    getBillingStatusErrorToastSessionKey(user?.id);
  const hasLoadedUser = isLoaded && Boolean(user?.id);
  const { data, isLoading, error } = useBillingStatusQuery({
    enabled: hasLoadedUser && !isPassiveRuntime && !isDemoRoute,
  });
  const shouldSurfaceBillingStatusError = isBillingOwnedSurface(pathname);

  // Normalize error to string without nested ternary
  const errorMessage = (() => {
    if (error instanceof Error) return error.message;
    if (error) return String(error);
    return null;
  })();

  // Normalize TanStack Query result to legacy shape for consumers
  const billingStatus: BillingStatus = useMemo(
    () => ({
      isPro: isPassiveRuntime ? false : (data?.isPro ?? false),
      plan: isPassiveRuntime || isDemoRoute ? null : (data?.plan ?? null),
      hasStripeCustomer: isPassiveRuntime
        ? false
        : (data?.hasStripeCustomer ?? false),
      loading: isPassiveRuntime || isDemoRoute ? false : isLoading,
      error: isPassiveRuntime || isDemoRoute ? null : errorMessage,
    }),
    [data, errorMessage, isDemoRoute, isLoading, isPassiveRuntime]
  );

  const redirectToUrl = (url: string) => {
    if (typeof window === 'undefined') return;
    if (typeof globalThis.location.assign === 'function') {
      globalThis.location.assign(url);
      return;
    }
    globalThis.location.href = url;
  };

  useEffect(() => {
    const shouldNotifyBillingStatusError =
      hasLoadedUser &&
      !billingStatus.loading &&
      Boolean(billingStatus.error) &&
      shouldSurfaceBillingStatusError;

    if (
      shouldNotifyBillingStatusError &&
      !hasNotifiedBillingErrorThisSession(billingStatusErrorToastSessionKey)
    ) {
      toast.error(
        "Couldn't confirm your plan. Billing actions may be unavailable.",
        { duration: 6000, id: 'billing-status-error' }
      );
      markBillingErrorNotifiedThisSession(billingStatusErrorToastSessionKey);
    }
  }, [
    billingStatus.error,
    billingStatus.loading,
    billingStatusErrorToastSessionKey,
    hasLoadedUser,
    shouldSurfaceBillingStatusError,
  ]);

  // User display info - upgrade OAuth avatar to high resolution
  const userImageUrl = useMemo(
    () => upgradeOAuthAvatarUrl(user?.imageUrl) ?? undefined,
    [user?.imageUrl]
  );
  const contactEmail =
    user?.primaryEmailAddress?.emailAddress ||
    user?.emailAddresses?.[0]?.emailAddress;

  const emailDerivedName = contactEmail
    ?.split('@')[0]
    ?.replaceAll(/[._-]+/g, ' ');

  const displayName =
    artist?.name ||
    user?.fullName ||
    (user?.firstName && user?.lastName
      ? `${user.firstName} ${user.lastName}`
      : user?.firstName) ||
    user?.username ||
    artist?.handle ||
    emailDerivedName ||
    'Artist';

  const userInitials = displayName
    ? displayName
        .split(' ')
        .map((n: string) => n[0] ?? '')
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'A';

  // Determine profile URL without nested ternary
  let profileUrl: string;
  if (profileHref) {
    profileUrl = profileHref;
  } else if (user?.username) {
    profileUrl = `/${user.username}`;
  } else if (artist?.handle) {
    profileUrl = `/${artist.handle}`;
  } else {
    profileUrl = APP_ROUTES.SETTINGS;
  }
  const settingsUrl = settingsHref ?? APP_ROUTES.SETTINGS;
  const usageStatsUrl = APP_ROUTES.SETTINGS_USAGE;

  const jovieUsername =
    user?.username || artist?.handle || contactEmail?.split('@')[0] || null;
  const formattedUsername = jovieUsername ? `@${jovieUsername}` : null;

  const menuActions = useUserMenuActions({
    billingStatus,
    profileUrl,
    redirectToUrl,
    settingsUrl,
    usageStatsUrl,
    signOut,
  });

  const userInfo: UserDisplayInfo = {
    userImageUrl,
    displayName,
    userInitials,
    contactEmail,
    formattedUsername,
    profileUrl,
    settingsUrl,
  };

  return {
    isLoaded,
    user,
    isMenuOpen,
    setIsMenuOpen,
    isFeedbackOpen,
    setIsFeedbackOpen,
    billingStatus,
    userInfo,
    menuActions,
  };
}
