'use client';

import { Badge, Button } from '@jovie/ui';
import { Copy, ExternalLink, X } from 'lucide-react';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { RightDrawer } from '@/components/organisms/RightDrawer';
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
  score: number;
  fields: ProfileField[];
}) {
  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between'>
        <span className='text-xs font-medium text-secondary-token uppercase tracking-wide'>
          Profile completeness
        </span>
        <span className='text-sm font-semibold text-primary-token'>
          {score}%
        </span>
      </div>
      <div className='h-2 w-full rounded-full bg-surface-3 overflow-hidden'>
        <div
          className='h-full rounded-full bg-brand-primary transition-all duration-300'
          style={{ width: `${score}%` }}
        />
      </div>
      <ul className='space-y-1.5'>
        {fields.map(field => (
          <li
            key={field.label}
            className='flex items-center gap-2 text-xs text-secondary-token'
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${field.filled ? 'bg-green-500' : 'bg-red-400'}`}
            />
            {field.label}
          </li>
        ))}
      </ul>
    </div>
  );
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
}: AdminUserDetailDrawerProps) {
  const isOpen = user !== null;
  const { score, fields } = user
    ? computeProfileCompleteness(user)
    : { score: 0, fields: [] };

  return (
    <RightDrawer isOpen={isOpen} width={400} ariaLabel='User details'>
      {user ? (
        <div className='flex flex-col h-full'>
          <div className='flex items-center justify-between border-b border-subtle px-4 py-3'>
            <h3 className='text-sm font-semibold text-primary-token truncate'>
              User details
            </h3>
            <button
              type='button'
              onClick={onClose}
              className='rounded-md p-1 text-secondary-token hover:text-primary-token hover:bg-surface-2 transition-colors'
              aria-label='Close drawer'
            >
              <X className='h-4 w-4' />
            </button>
          </div>

          <div className='flex-1 overflow-y-auto p-4 space-y-5'>
            {/* Name and email */}
            <div className='space-y-1'>
              <p className='text-base font-semibold text-primary-token'>
                {user.name ?? 'Unnamed user'}
              </p>
              {user.email ? (
                <div className='flex items-center gap-1.5'>
                  <p className='text-sm text-secondary-token truncate'>
                    {user.email}
                  </p>
                  <CopyButton value={user.email} label='Email' />
                </div>
              ) : (
                <p className='text-sm text-secondary-token'>No email</p>
              )}
            </div>

            {/* Status badges */}
            <div className='flex flex-wrap gap-2'>
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

            {/* Profile completeness */}
            <ProfileCompletenessBar score={score} fields={fields} />

            {/* Details section */}
            <div className='space-y-3'>
              <p className='text-xs font-medium text-secondary-token uppercase tracking-wide'>
                Details
              </p>

              <dl className='space-y-2 text-sm'>
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
                    <span className='truncate max-w-[140px]'>
                      {user.clerkId}
                    </span>
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
            </div>

            {/* Actions */}
            {user.clerkId.length > 0 ? (
              <div>
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
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
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </RightDrawer>
  );
}
