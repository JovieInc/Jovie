'use client';

import { Badge } from '@jovie/ui';
import { Copy, ExternalLink } from 'lucide-react';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { AppIconButton } from '@/components/atoms/AppIconButton';
import {
  DrawerButton,
  DrawerLinkSection,
  DrawerPropertyRow,
  DrawerSection,
  EntitySidebarShell,
  SidebarLinkRow,
} from '@/components/molecules/drawer';
import { copyToClipboard } from '@/hooks/useClipboard';
import type { AdminUserRow } from '@/lib/admin/users';

interface AdminUserDetailDrawerProps {
  readonly user: AdminUserRow | null;
  readonly onClose: () => void;
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

function formatSocialPlatformLabel(
  platform: string | null | undefined
): string {
  return String(platform ?? 'unknown').replaceAll('_', ' ');
}

function normalizeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    const protocol = url.protocol.toLowerCase();
    return protocol === 'http:' || protocol === 'https:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
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

  const filled = fields.filter(field => field.filled).length;
  const score = Math.round((filled / fields.length) * 100);

  return { score, fields };
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(value);
    if (ok) {
      toast.success(`${label} copied`, { duration: 2000 });
    } else {
      toast.error(`Failed to copy ${label}`);
    }
  }, [value, label]);

  return (
    <AppIconButton
      type='button'
      variant='ghost'
      ariaLabel={`Copy ${label}`}
      tooltipLabel={`Copy ${label}`}
      className='h-6 w-6 border-transparent bg-transparent text-(--linear-text-tertiary) hover:border-(--linear-border-subtle) hover:bg-(--linear-bg-surface-1) hover:text-(--linear-text-primary)'
      onClick={handleCopy}
    >
      <Copy />
    </AppIconButton>
  );
}

function ProfileCompletenessBar({
  score,
  fields,
}: {
  readonly score: number;
  readonly fields: ProfileField[];
}) {
  return (
    <div className='space-y-3 rounded-[12px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) p-3'>
      <div className='flex items-center justify-between'>
        <span className='text-[11px] font-[510] uppercase tracking-[0.08em] text-(--linear-text-tertiary)'>
          Profile completeness
        </span>
        <span className='text-[13px] font-[590] tracking-[-0.01em] text-(--linear-text-primary)'>
          {score}%
        </span>
      </div>
      <div className='h-1.5 w-full overflow-hidden rounded-full bg-(--linear-bg-surface-2)'>
        <div
          className='h-full rounded-full bg-brand-primary transition-all duration-300'
          style={{ width: `${score}%` }}
        />
      </div>
      <ul className='grid grid-cols-1 gap-1.5 sm:grid-cols-2'>
        {fields.map(field => (
          <li
            key={field.label}
            className='flex items-center gap-2 text-[12px] leading-[16px] text-(--linear-text-secondary)'
          >
            <span
              className={[
                'inline-block h-1.5 w-1.5 rounded-full',
                field.filled ? 'bg-success' : 'bg-error',
              ].join(' ')}
            />
            {field.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function buildStatusBadges(user: AdminUserRow) {
  return (
    <div className='flex flex-wrap gap-2'>
      <Badge size='sm' variant={user.plan === 'pro' ? 'primary' : 'secondary'}>
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
  );
}

function UserHeader({ user }: { readonly user: AdminUserRow }) {
  return (
    <div className='space-y-3'>
      <div className='space-y-1'>
        <p className='truncate text-[15px] font-[590] leading-[18px] tracking-[-0.015em] text-(--linear-text-primary)'>
          {user.name ?? 'Unnamed user'}
        </p>
        <p className='truncate text-[12px] leading-[16px] text-(--linear-text-secondary)'>
          {user.email ?? 'No email'}
        </p>
      </div>
      {buildStatusBadges(user)}
    </div>
  );
}

function IdValue({
  value,
  label,
}: {
  readonly value: string;
  readonly label: string;
}) {
  return (
    <div className='flex min-w-0 items-center justify-end gap-1'>
      <span className='truncate font-mono text-[11px] text-(--linear-text-primary)'>
        {value}
      </span>
      <CopyButton value={value} label={label} />
    </div>
  );
}

function SocialLinksSection({ user }: { readonly user: AdminUserRow }) {
  const socialLinks =
    user.socialLinks?.slice(0, 8).flatMap(link => {
      const safeUrl = normalizeExternalUrl(link.url);
      if (!safeUrl) return [];

      return [
        {
          id: link.id,
          href: safeUrl,
          label: link.displayText ?? formatSocialPlatformLabel(link.platform),
        },
      ];
    }) ?? [];

  if (socialLinks.length === 0) return null;

  return (
    <DrawerLinkSection title='Social & music links'>
      <div className='space-y-1 px-3'>
        {socialLinks.map(link => (
          <SidebarLinkRow
            key={link.id}
            icon={
              <ExternalLink
                className='h-3.5 w-3.5 text-(--linear-text-tertiary)'
                aria-hidden='true'
              />
            }
            label={link.label}
            url={link.href}
          />
        ))}
      </div>
    </DrawerLinkSection>
  );
}

function UserDrawerContent({ user }: { readonly user: AdminUserRow }) {
  const { score, fields } = computeProfileCompleteness(user);

  return (
    <>
      <ProfileCompletenessBar score={score} fields={fields} />

      <DrawerSection title='Details'>
        <div className='space-y-1'>
          <DrawerPropertyRow
            label='User ID'
            labelWidth={96}
            value={<IdValue value={user.id} label='User ID' />}
          />
          <DrawerPropertyRow
            label='Clerk ID'
            labelWidth={96}
            value={<IdValue value={user.clerkId} label='Clerk ID' />}
          />
          <DrawerPropertyRow
            label='Signed up'
            labelWidth={96}
            value={dateFormatter.format(user.createdAt)}
          />
          {user.deletedAt ? (
            <DrawerPropertyRow
              label='Deleted'
              labelWidth={96}
              value={dateFormatter.format(user.deletedAt)}
            />
          ) : null}
          <DrawerPropertyRow
            label='Stripe'
            labelWidth={96}
            value={
              user.stripeCustomerId ? (
                <span className='truncate font-mono text-[11px] text-(--linear-text-primary)'>
                  {user.stripeCustomerId}
                </span>
              ) : (
                <span className='text-(--linear-text-tertiary)'>None</span>
              )
            }
          />
        </div>
      </DrawerSection>

      <SocialLinksSection user={user} />
    </>
  );
}

export function AdminUserDetailDrawer({
  user,
  onClose,
}: AdminUserDetailDrawerProps) {
  return (
    <EntitySidebarShell
      isOpen={user !== null}
      width={400}
      ariaLabel='User details'
      title='User details'
      onClose={onClose}
      isEmpty={!user}
      emptyMessage='Select a user to view details.'
      entityHeader={user ? <UserHeader user={user} /> : undefined}
      footer={
        user?.clerkId ? (
          <DrawerButton
            type='button'
            tone='secondary'
            className='w-full'
            onClick={() => {
              globalThis.open(
                `https://dashboard.clerk.com/apps/users/user_${encodeURIComponent(user.clerkId)}`,
                '_blank',
                'noopener,noreferrer'
              );
            }}
          >
            <ExternalLink className='mr-1.5 h-3.5 w-3.5' />
            Open in Clerk
          </DrawerButton>
        ) : undefined
      }
    >
      {user ? <UserDrawerContent user={user} /> : null}
    </EntitySidebarShell>
  );
}
