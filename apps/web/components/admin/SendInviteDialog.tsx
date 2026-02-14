'use client';

import { Button, Input } from '@jovie/ui';
import Image from 'next/image';
import { useState } from 'react';

import { Icon } from '@/components/atoms/Icon';
import { Dialog, DialogBody, DialogTitle } from '@/components/organisms/Dialog';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';
import { useCreateInviteMutation } from '@/lib/queries/useInviteMutation';
import { normalizeEmail } from '@/lib/utils/email';

interface SendInviteDialogProps {
  readonly profile: AdminCreatorProfileRow | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: () => void;
}

export function SendInviteDialog({
  profile,
  open,
  onOpenChange,
  onSuccess,
}: Readonly<SendInviteDialogProps>) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // TanStack Query mutation for cache invalidation
  const createInviteMutation = useCreateInviteMutation();

  if (!profile) return null;

  const isLoading = createInviteMutation.isPending;

  const handleClose = () => {
    if (!isLoading) {
      setEmail('');
      setError(null);
      setSuccess(false);
      onOpenChange(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const trimmedEmail = normalizeEmail(email);

    if (!trimmedEmail) {
      setError('Please enter an email address');
      return;
    }

    // Limit input length to prevent ReDoS (RFC 5321 max email length is 254)
    if (trimmedEmail.length > 254) {
      setError('Email address is too long');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    try {
      await createInviteMutation.mutateAsync({
        creatorProfileId: profile.id,
        email: trimmedEmail,
      });

      setSuccess(true);
      setEmail('');

      // Close dialog after showing success briefly
      setTimeout(() => {
        handleClose();
        onSuccess?.();
      }, 1500);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to send invite';
      setError(errorMessage);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} size='md'>
      <DialogTitle>Send Claim Invite</DialogTitle>
      <DialogBody>
        <form onSubmit={handleSubmit} className='space-y-4'>
          {/* Profile info */}
          <div className='flex items-center gap-3 rounded-lg border border-subtle bg-surface-2/50 p-3'>
            {profile.avatarUrl ? (
              <Image
                src={profile.avatarUrl}
                alt={profile.displayName || profile.username}
                width={40}
                height={40}
                sizes='40px'
                className='rounded-full object-cover'
                unoptimized={profile.avatarUrl.includes('i.scdn.co')}
              />
            ) : (
              <div className='flex h-10 w-10 items-center justify-center rounded-full bg-surface-3'>
                <Icon name='User' className='h-5 w-5 text-tertiary-token' />
              </div>
            )}
            <div>
              <p className='text-sm font-medium text-primary-token'>
                {profile.displayName || profile.username}
              </p>
              <p className='text-xs text-secondary-token'>
                @{profile.username}
              </p>
            </div>
          </div>

          {/* Email input */}
          <div className='space-y-2'>
            <label
              htmlFor='invite-email'
              className='text-sm font-medium text-primary-token'
            >
              Email Address
            </label>
            <Input
              id='invite-email'
              type='email'
              placeholder='creator@example.com'
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEmail(e.target.value)
              }
              disabled={isLoading || success}
              autoFocus
              className='w-full'
            />
            <p className='text-xs text-secondary-token'>
              An invite will be queued to send to this email address
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className='flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2'>
              <Icon
                name='XCircle'
                className='h-3.5 w-3.5 text-destructive shrink-0'
              />
              <p className='text-xs font-medium text-destructive'>{error}</p>
            </div>
          )}

          {/* Success message */}
          {success && (
            <div className='flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-2'>
              <Icon
                name='CheckCircle'
                className='h-3.5 w-3.5 text-success shrink-0'
              />
              <p className='text-xs font-medium text-success'>
                Invite created successfully!
              </p>
            </div>
          )}

          {/* Actions */}
          <div className='flex gap-3 justify-end pt-2'>
            <Button
              type='button'
              variant='ghost'
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type='submit'
              variant='primary'
              disabled={isLoading || success || !email.trim()}
            >
              {isLoading ? (
                <>
                  <Icon
                    name='Loader2'
                    className='mr-2 h-3.5 w-3.5 animate-spin'
                  />
                  Creating...
                </>
              ) : (
                <>
                  <Icon name='Send' className='mr-2 h-3.5 w-3.5' />
                  Create Invite
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogBody>
    </Dialog>
  );
}
