'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import { Badge } from '@jovie/ui';
import { Copy, ExternalLink } from 'lucide-react';
import { useCallback } from 'react';
import { toast } from 'sonner';
import {
  DrawerCardActionBar,
  DrawerSection,
  DrawerSurfaceCard,
  EntityHeaderCard,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
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

interface ProfileField {
  label: string;
  filled: boolean;
}

function computeProfileCompleteness(user: AdminUserRow): {
  score: number;
  fields: ProfileField[];
} {
  const fields: ProfileField[] = [
    { label: 'Name', filled: Boolean(user.name) },
    { label: 'Email', filled: Boolean(user.email) },
    { label: 'Billing connected', filled: Boolean(user.stripeCustomerId) },
    { label: 'Subscription', filled: Boolean(user.stripeSubscriptionId) },
    { label: 'Active account', filled: !user.deletedAt },
  ];

  const filled = fields.filter(f => f.filled).length;
  const score = Math.round((filled / fields.length) * 100);

  return { score, fields };
}

function ProfileCompletenessBar({
  score,
  fields,
}: {
  readonly score: number;
  readonly fields: ProfileField[];
}) {
  return (
    <div className='space-y-2.5'>
      <div className='flex items-center justify-between'>
        <span className='text-xs font-medium tracking-normal text-secondary-token'>
          Profile completeness
        </span>
        <span className='text-xs font-semibold text-primary-token'>
          {score}%
        </span>
      </div>
      <div className='h-1.5 w-full overflow-hidden rounded-full bg-surface-3'>
        <div
          className='h-full rounded-full bg-brand-primary transition-all duration-300'
          style={{ width: `${score}%` }}
        />
      </div>
      <ul className='space-y-1'>
        {fields.map(field => (
          <li
            key={field.label}
            className='flex items-center gap-2 text-2xs text-secondary-token'
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${field.filled ? 'bg-success' : 'bg-error'}`}
            />
            {field.label}
          </li>
        ))}
      </ul>
    </div>
  );
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
    <button
      type='button'
      onClick={handleCopy}
      className='inline-flex items-center text-secondary-token hover:text-primary-token transition-colors'
      aria-label={`Copy ${label}`}
    >
      <Copy className='h-3 w-3' />
    </button>
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
      contextMenuItems={contextMenuItems}
      isEmpty={!hasUser}
      emptyMessage='Select a user to view details.'
      entityHeader={
        user ? (
          <DrawerSurfaceCard variant='card' className='p-3'>
            <EntityHeaderCard
              eyebrow='User'
              title={user.name ?? 'Unnamed user'}
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
              actions={
                <DrawerCardActionBar
                  primaryActions={[]}
                  menuItems={contextMenuItems}
                  onClose={onClose}
                  overflowTriggerPlacement='card-top-right'
                  overflowTriggerIcon='vertical'
                  className='border-0 bg-transparent px-0 py-0'
                />
              }
              bodyClassName='pr-9'
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
  const { score, fields } = computeProfileCompleteness(user);

  return (
    <>
      <DrawerSection title='Profile' className='space-y-1.5' surface='card'>
        <ProfileCompletenessBar score={score} fields={fields} />
      </DrawerSection>

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
              <span className='truncate max-w-[140px]'>{user.id}</span>
              <CopyButton value={user.id} label='User ID' />
            </dd>
          </div>

          <div className='flex justify-between'>
            <dt className='text-secondary-token'>Clerk ID</dt>
            <dd className='flex items-center gap-1.5 text-primary-token font-mono text-xs'>
              <span className='truncate max-w-[140px]'>{user.clerkId}</span>
              <CopyButton value={user.clerkId} label='Clerk ID' />
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
                <span className='font-mono text-xs truncate max-w-[140px] inline-block'>
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
