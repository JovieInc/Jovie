'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import { Badge, Button, UserAvatar } from '@jovie/ui';
import { Copy, ExternalLink } from 'lucide-react';
import { useCallback } from 'react';
import { toast } from '@/components/feedback';
import {
  DrawerAnalyticsSummaryCard,
  DrawerCardActionBar,
  DrawerSection,
  DrawerSurfaceCard,
  EntitySidebarShell,
  ShareableLinkRow,
} from '@/components/molecules/drawer';
import { DrawerHero } from '@/components/shell/DrawerHero';
import { copyToClipboard } from '@/hooks/useClipboard';
import type { AdminUserRow } from '@/lib/admin/types';

interface AdminUserDetailDrawerProps {
  readonly user: AdminUserRow | null;
  readonly onClose: () => void;
  readonly contextMenuItems?: CommonDropdownItem[];
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function computeProfileCompleteness(user: AdminUserRow): number {
  const fields = [
    Boolean(user.name),
    Boolean(user.email),
    Boolean(user.stripeCustomerId),
    Boolean(user.stripeSubscriptionId),
    !user.deletedAt,
  ];

  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}

function CopyButton({
  value,
  label,
}: {
  readonly value: string;
  readonly label: string;
}) {
  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(value);
    if (ok) {
      toast.success(`${label} copied`, { duration: 2000 });
    } else {
      toast.error(`Failed to copy ${label}`);
    }
  }, [value, label]);

  return (
    <Button
      type='button'
      variant='ghost'
      size='icon'
      onClick={handleCopy}
      className='inline-flex h-auto w-auto items-center p-0 text-secondary-token hover:bg-transparent hover:text-primary-token transition-colors'
      aria-label={`Copy ${label}`}
    >
      <Copy className='h-3 w-3' />
    </Button>
  );
}

export function AdminUserDetailDrawer({
  user,
  onClose,
  contextMenuItems,
}: AdminUserDetailDrawerProps) {
  const hasUser = user !== null;

  return (
    <EntitySidebarShell
      isOpen={hasUser}
      width={400}
      ariaLabel='User details'
      scrollStrategy='shell'
      onClose={onClose}
      headerMode='minimal'
      hideMinimalHeaderBar
      workspaceSurface='raised'
      entityHeaderSurface='flat'
      contextMenuItems={contextMenuItems}
      isEmpty={!hasUser}
      emptyMessage='Select a user to view details.'
      entityHeader={
        user ? (
          <DrawerSurfaceCard
            variant='card'
            className='relative overflow-hidden'
          >
            <div className='absolute right-2 top-2 z-10'>
              <DrawerCardActionBar
                primaryActions={[]}
                menuItems={contextMenuItems}
                onClose={onClose}
                overflowTriggerPlacement='card-top-right'
                overflowTriggerIcon='vertical'
                className='border-0 bg-transparent px-0 py-0'
              />
            </div>
            <DrawerHero
              title={user.name ?? 'Unnamed user'}
              density='rail'
              artwork={
                <UserAvatar
                  name={user.name ?? user.email ?? 'User'}
                  size='lg'
                />
              }
              subtitle={
                user.email ? (
                  <div className='flex items-center gap-1.5'>
                    <span className='truncate'>{user.email}</span>
                    <CopyButton value={user.email} label='Email' />
                  </div>
                ) : (
                  'No email'
                )
              }
              meta={
                <div className='flex flex-wrap gap-1.5'>
                  <Badge
                    size='sm'
                    variant={user.plan === 'pro' ? 'primary' : 'secondary'}
                  >
                    {user.plan}
                  </Badge>
                  {user.deletedAt ? (
                    <Badge size='sm' variant='warning'>
                      Deleted
                    </Badge>
                  ) : (
                    <Badge size='sm' variant='success'>
                      Active
                    </Badge>
                  )}
                </div>
              }
              stableLayout
              titleLineClamp={1}
              subtitleLineClamp={1}
              reserveSubtitleSlot
              reserveMetaSlot
              metaOverflow='scroll'
              className='[&_h2]:pr-9'
              testId='admin-user-entity-header'
            />
          </DrawerSurfaceCard>
        ) : undefined
      }
    >
      {user && <UserDrawerContent user={user} />}
    </EntitySidebarShell>
  );
}

function UserDrawerContent({ user }: { readonly user: AdminUserRow }) {
  const score = computeProfileCompleteness(user);
  const socialLinkCount = user.socialLinks?.length ?? 0;
  const profileUrl = user.profileUsername
    ? `https://jov.ie/${user.profileUsername}`
    : null;

  return (
    <>
      <DrawerAnalyticsSummaryCard
        testId='admin-user-summary'
        state='ready'
        stableLayout
        reserveFooterSlot
        metricSlotCount={2}
        metrics={[
          {
            id: 'profile-completeness',
            label: 'Profile Complete',
            value: `${score}%`,
          },
          {
            id: 'linked-destinations',
            label: 'Linked Destinations',
            value: String(socialLinkCount),
          },
        ]}
        footer={
          profileUrl ? (
            <ShareableLinkRow
              url={profileUrl}
              density='rail'
              surface='flat'
              testId='admin-user-profile-link'
            />
          ) : null
        }
      />

      {user.socialLinks && user.socialLinks.length > 0 ? (
        <DrawerSection
          title='Social & music links'
          className='space-y-1.5'
          surface='card'
        >
          <div className='space-y-1'>
            {user.socialLinks.slice(0, 8).map(link => (
              <a
                key={link.id}
                href={link.url}
                target='_blank'
                rel='noopener noreferrer'
                className='flex items-center justify-between rounded-md border border-subtle px-2.5 py-2 text-xs transition-colors hover:bg-surface-0'
              >
                <span className='text-primary-token capitalize'>
                  {link.displayText ?? link.platform.replaceAll('_', ' ')}
                </span>
                <ExternalLink className='h-3 w-3 text-secondary-token' />
              </a>
            ))}
          </div>
        </DrawerSection>
      ) : null}

      <DrawerSection title='Details' className='space-y-1.5' surface='card'>
        <dl className='space-y-2 text-xs'>
          <div className='flex justify-between'>
            <dt className='text-secondary-token'>User ID</dt>
            <dd className='flex items-center gap-1.5 text-primary-token font-mono text-xs'>
              <span className='truncate max-w-35'>{user.id}</span>
              <CopyButton value={user.id} label='User ID' />
            </dd>
          </div>

          <div className='flex justify-between'>
            <dt className='text-secondary-token'>Clerk ID</dt>
            <dd className='flex items-center gap-1.5 text-primary-token font-mono text-xs'>
              <span className='truncate max-w-35'>{user.clerkId ?? '—'}</span>
              <CopyButton value={user.clerkId ?? ''} label='Clerk ID' />
            </dd>
          </div>

          <div className='flex justify-between'>
            <dt className='text-secondary-token'>Signed up</dt>
            <dd className='text-primary-token'>
              {dateFormatter.format(user.createdAt)}
            </dd>
          </div>

          {user.deletedAt ? (
            <div className='flex justify-between'>
              <dt className='text-secondary-token'>Deleted</dt>
              <dd className='text-primary-token'>
                {dateFormatter.format(user.deletedAt)}
              </dd>
            </div>
          ) : null}

          <div className='flex justify-between'>
            <dt className='text-secondary-token'>Stripe customer</dt>
            <dd className='text-primary-token'>
              {user.stripeCustomerId ? (
                <span className='font-mono text-xs truncate max-w-35 inline-block'>
                  {user.stripeCustomerId}
                </span>
              ) : (
                <span className='text-tertiary-token'>None</span>
              )}
            </dd>
          </div>
        </dl>
      </DrawerSection>
    </>
  );
}
