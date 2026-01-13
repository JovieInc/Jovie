'use client';

import { useClerk, useUser } from '@clerk/nextjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useBillingStatusQuery } from '@/lib/queries';
import { upgradeOAuthAvatarUrl } from '@/lib/utils/avatar-url';
import type { Artist } from '@/types/db';
import { useUserMenuActions } from '../useUserMenuActions';
import type { UserDisplayInfo } from './types';

export interface UseUserButtonProps {
  artist?: Artist | null;
  profileHref?: string;
  settingsHref?: string;
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
  user: ReturnType<typeof useUser>['user'];
  isMenuOpen: boolean;
  setIsMenuOpen: (open: boolean) => void;
  isFeedbackOpen: boolean;
  setIsFeedbackOpen: (open: boolean) => void;
  billingStatus: BillingStatus;
  userInfo: UserDisplayInfo;
  menuActions: ReturnType<typeof useUserMenuActions>;
}

export function useUserButton({
  artist,
  profileHref,
  settingsHref,
}: UseUserButtonProps): UseUserButtonReturn {
  const { isLoaded, user } = useUser();
  const { signOut } = useClerk();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const { data, isLoading, error } = useBillingStatusQuery();
  const billingErrorNotifiedRef = useRef(false);

  // Normalize TanStack Query result to legacy shape for consumers
  const billingStatus: BillingStatus = useMemo(
    () => ({
      isPro: data?.isPro ?? false,
      plan: data?.plan ?? null,
      hasStripeCustomer: data?.hasStripeCustomer ?? false,
      loading: isLoading,
      error:
        error instanceof Error ? error.message : error ? String(error) : null,
    }),
    [data, isLoading, error]
  );

  const redirectToUrl = (url: string) => {
    if (typeof window === 'undefined') return;
    if (typeof window.location.assign === 'function') {
      window.location.assign(url);
      return;
    }
    window.location.href = url;
  };

  useEffect(() => {
    if (billingStatus.error && !billingErrorNotifiedRef.current) {
      toast.error(
        "Couldn't confirm your plan. Billing actions may be unavailable.",
        { duration: 6000, id: 'billing-status-error' }
      );
      billingErrorNotifiedRef.current = true;
    }

    if (!billingStatus.error) {
      billingErrorNotifiedRef.current = false;
    }
  }, [billingStatus.error]);

  // User display info - upgrade OAuth avatar to high resolution
  const userImageUrl = useMemo(
    () => upgradeOAuthAvatarUrl(user?.imageUrl) ?? undefined,
    [user?.imageUrl]
  );
  const contactEmail =
    user?.primaryEmailAddress?.emailAddress ||
    user?.emailAddresses?.[0]?.emailAddress;

  const emailDerivedName = contactEmail?.split('@')[0]?.replace(/[._-]+/g, ' ');

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

  const profileUrl =
    profileHref ??
    (user?.username
      ? `/${user.username}`
      : artist?.handle
        ? `/${artist.handle}`
        : '/app/settings');
  const settingsUrl = settingsHref ?? '/app/settings';

  const jovieUsername =
    user?.username || artist?.handle || contactEmail?.split('@')[0] || null;
  const formattedUsername = jovieUsername ? `@${jovieUsername}` : null;

  const menuActions = useUserMenuActions({
    billingStatus,
    profileUrl,
    redirectToUrl,
    settingsUrl,
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
