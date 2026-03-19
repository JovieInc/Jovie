'use client';

import {
  ArrowRight,
  BadgeDollarSign,
  MessageSquare,
  Share2,
  ShoppingBag,
} from 'lucide-react';
import Link from 'next/link';
import { memo, useCallback, useMemo } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { APP_ROUTES } from '@/constants/routes';
import { ProfileCompletionCard } from '@/features/dashboard/molecules/ProfileCompletionCard';
import { useClipboard } from '@/hooks/useClipboard';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { isShopEnabled } from '@/lib/profile/shop-settings';
import { useDashboardSocialLinksQuery } from '@/lib/queries';

interface ActionCardProps {
  readonly icon: React.ReactNode;
  readonly heading: string;
  readonly subtext: string;
  readonly href?: string;
  readonly onClick?: () => void;
}

function ActionCard({
  icon,
  heading,
  subtext,
  href,
  onClick,
}: ActionCardProps) {
  const content = (
    <ContentSurfaceCard className='group flex items-center justify-between gap-3 p-3.5 transition-[background-color,border-color] duration-150 hover:bg-surface-2'>
      <div className='flex items-center gap-3 min-w-0'>
        <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent'>
          {icon}
        </div>
        <div className='min-w-0'>
          <p className='text-[13px] font-[510] text-primary-token'>{heading}</p>
          <p className='truncate text-[12px] text-secondary-token'>{subtext}</p>
        </div>
      </div>
      <ArrowRight
        className='h-4 w-4 shrink-0 text-tertiary-token transition-transform group-hover:translate-x-0.5'
        aria-hidden='true'
      />
    </ContentSurfaceCard>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return (
    <button type='button' onClick={onClick} className='w-full text-left'>
      {content}
    </button>
  );
}

interface SmartActionCardsProps {
  readonly profileId?: string;
  readonly username?: string;
  readonly onFeedbackClick?: () => void;
}

export const SmartActionCards = memo(function SmartActionCards({
  profileId,
  username,
  onFeedbackClick,
}: SmartActionCardsProps) {
  const { profileCompletion, selectedProfile } = useDashboardData();
  const { data: socialLinks } = useDashboardSocialLinksQuery(profileId ?? '');
  const notifications = useNotifications();
  const { copy } = useClipboard({
    onSuccess: () => notifications.success('Profile link copied!'),
    onError: () => notifications.error('Could not copy link'),
  });

  const profileSettings = selectedProfile?.settings as Record<
    string,
    unknown
  > | null;

  const hasVenmo = useMemo(
    () => (socialLinks ?? []).some(l => l.platform === 'venmo'),
    [socialLinks]
  );
  const hasShopify = isShopEnabled(profileSettings);
  const isProfileComplete = (profileCompletion?.percentage ?? 0) >= 100;

  const handleShareProfile = useCallback(() => {
    if (username) {
      copy(`https://jov.ie/${username}`);
    }
  }, [username, copy]);

  const MAX_CARDS = 3;
  const cards: React.ReactNode[] = [];

  // 1. Profile completion card (takes a slot if incomplete)
  const showProfileCompletion = !isProfileComplete;

  // 2. Build action cards
  if (!hasVenmo) {
    cards.push(
      <ActionCard
        key='tips'
        icon={<BadgeDollarSign className='h-4 w-4' />}
        heading='Accept tips from fans'
        subtext='Connect Venmo to receive tips on your profile'
        href={APP_ROUTES.DASHBOARD_LINKS}
      />
    );
  }

  if (!hasShopify) {
    cards.push(
      <ActionCard
        key='merch'
        icon={<ShoppingBag className='h-4 w-4' />}
        heading='Sell merch from your profile'
        subtext='Connect your Shopify store'
        href={APP_ROUTES.SETTINGS}
      />
    );
  }

  if (isProfileComplete && username) {
    cards.push(
      <ActionCard
        key='share'
        icon={<Share2 className='h-4 w-4' />}
        heading='Share your profile'
        subtext={`jov.ie/${username}`}
        onClick={handleShareProfile}
      />
    );
  }

  if (onFeedbackClick) {
    cards.push(
      <ActionCard
        key='feedback'
        icon={<MessageSquare className='h-4 w-4' />}
        heading='Share feedback'
        subtext='Help us improve Jovie'
        onClick={onFeedbackClick}
      />
    );
  }

  // Limit cards: if showing profile completion, allow fewer action cards
  const actionSlots = showProfileCompletion ? MAX_CARDS - 1 : MAX_CARDS;
  const visibleCards = cards.slice(0, actionSlots);

  if (!showProfileCompletion && visibleCards.length === 0) {
    return null;
  }

  return (
    <div className='space-y-2'>
      {showProfileCompletion && <ProfileCompletionCard />}
      {visibleCards}
    </div>
  );
});
