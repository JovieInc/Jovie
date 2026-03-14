'use client';

import { Input } from '@jovie/ui';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import { Icon } from '@/components/atoms/Icon';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  DrawerButton,
  DrawerFormField,
  DrawerSurfaceCard,
} from '@/components/molecules/drawer';
import { Dialog, DialogBody, DialogTitle } from '@/components/organisms/Dialog';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';
import { useCreateInviteMutation } from '@/lib/queries';
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
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // TanStack Query mutation for cache invalidation
  const createInviteMutation = useCreateInviteMutation();

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  const isLoading = createInviteMutation.isPending;

  if (!profile) return null;

  const handleClose = () => {
    if (!isLoading) {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
        successTimeoutRef.current = null;
      }
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
    const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
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
      successTimeoutRef.current = setTimeout(() => {
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
          <ContentSurfaceCard className='flex items-center gap-3 rounded-[10px] bg-(--linear-bg-surface-0) p-3'>
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
              <div className='flex h-10 w-10 items-center justify-center rounded-full border border-(--linear-border-subtle) bg-(--linear-bg-surface-1)'>
                <Icon
                  name='User'
                  className='h-5 w-5 text-(--linear-text-tertiary)'
                />
              </div>
            )}
            <div>
              <p className='text-sm font-medium text-(--linear-text-primary)'>
                {profile.displayName || profile.username}
              </p>
              <p className='text-xs text-(--linear-text-secondary)'>
                @{profile.username}
              </p>
            </div>
          </ContentSurfaceCard>

          {/* Email input */}
          <DrawerFormField
            label='Email Address'
            helperText='An invite will be queued to send to this email address'
          >
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
          </DrawerFormField>

          {/* Error message */}
          {error && (
            <DrawerSurfaceCard className='flex items-center gap-2 border-destructive/20 bg-destructive/8 px-3 py-2'>
              <Icon
                name='XCircle'
                className='h-3.5 w-3.5 text-destructive shrink-0'
              />
              <p className='text-xs font-medium text-destructive'>{error}</p>
            </DrawerSurfaceCard>
          )}

          {/* Success message */}
          {success && (
            <DrawerSurfaceCard className='flex items-center gap-2 border-success/20 bg-success/8 px-3 py-2'>
              <Icon
                name='CheckCircle'
                className='h-3.5 w-3.5 text-success shrink-0'
              />
              <p className='text-xs font-medium text-success'>
                Invite created successfully!
              </p>
            </DrawerSurfaceCard>
          )}

          {/* Actions */}
          <div className='flex gap-3 justify-end pt-2'>
            <DrawerButton
              type='button'
              tone='ghost'
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </DrawerButton>
            <DrawerButton
              type='submit'
              tone='primary'
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
            </DrawerButton>
          </div>
        </form>
      </DialogBody>
    </Dialog>
  );
}
