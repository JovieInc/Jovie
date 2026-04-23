'use client';

/**
 * EmailManagementCard Component
 *
 * Manages email addresses tied to the user's account.
 * Allows adding, verifying, and removing email addresses.
 */

import { Badge, Button, Input } from '@jovie/ui';
import { CheckCircle, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { DashboardCard } from '@/features/dashboard/atoms/DashboardCard';

import type { ClerkEmailAddressResource, ClerkUserResource } from './types';
import { useEmailManagement } from './useEmailManagement';

export interface EmailManagementCardProps {
  readonly user: ClerkUserResource;
}

export function EmailManagementCard({ user }: EmailManagementCardProps) {
  const [emailToRemove, setEmailToRemove] =
    useState<ClerkEmailAddressResource | null>(null);

  // Use the extracted hook for all email management logic
  const {
    newEmail,
    setNewEmail,
    verificationCode,
    setVerificationCode,
    pendingEmail,
    emailStatus,
    emailError,
    syncingEmailId,
    primaryEmailId,
    sortedEmails,
    resetEmailForm,
    handleStartEmailUpdate,
    handleVerifyEmail,
    handleMakePrimary,
    handleRemoveEmail,
  } = useEmailManagement(user);

  let emailButtonLabel = 'Add';
  if (pendingEmail) {
    emailButtonLabel = emailStatus === 'verifying' ? 'Verifying…' : 'Confirm';
  } else if (emailStatus === 'sending') {
    emailButtonLabel = 'Sending…';
  }

  return (
    <>
      <DashboardCard
        variant='settings'
        padding='none'
        className='divide-y divide-subtle/60 overflow-hidden'
      >
        {sortedEmails.map(email => {
          const isPrimary = email.id === primaryEmailId;
          const isVerified = email.verification?.status === 'verified';

          return (
            <div
              key={email.id}
              className='flex items-start justify-between gap-3 px-4 py-3 sm:px-5'
            >
              <div className='min-w-0 flex-1'>
                <div>
                  <div className='flex flex-wrap items-center gap-1.5'>
                    <p className='text-app font-caption text-primary-token'>
                      {email.emailAddress}
                    </p>
                    {isPrimary ? (
                      <Badge variant='secondary' size='sm'>
                        Primary
                      </Badge>
                    ) : null}
                  </div>
                  <div className='mt-1 flex flex-wrap items-center gap-1.5 text-2xs text-secondary-token'>
                    {isVerified ? (
                      <Badge variant='success' size='sm' className='gap-1'>
                        <CheckCircle className='h-3.5 w-3.5' aria-hidden />
                        Verified
                      </Badge>
                    ) : (
                      <Badge variant='warning' size='sm' className='gap-1'>
                        <ShieldAlert className='h-3.5 w-3.5' aria-hidden />
                        Unverified
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className='flex shrink-0 items-center gap-2'>
                {!isPrimary && isVerified ? (
                  <Button
                    variant='ghost'
                    size='sm'
                    disabled={syncingEmailId === email.id}
                    onClick={() => handleMakePrimary(email)}
                    className='h-7 rounded-[8px] border border-transparent px-2.5 text-2xs font-caption text-secondary-token hover:border-(--linear-app-frame-seam) hover:bg-surface-0 hover:text-primary-token'
                  >
                    {syncingEmailId === email.id ? 'Updating…' : 'Make primary'}
                  </Button>
                ) : null}
                {isPrimary ? null : (
                  <Button
                    variant='ghost'
                    size='sm'
                    className='h-7 rounded-[8px] border border-transparent px-2.5 text-2xs font-caption text-secondary-token hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive'
                    disabled={syncingEmailId === email.id}
                    onClick={() => setEmailToRemove(email)}
                  >
                    {syncingEmailId === email.id ? 'Removing…' : 'Remove'}
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        <div className='px-4 py-3 sm:px-5'>
          <form
            onSubmit={pendingEmail ? handleVerifyEmail : handleStartEmailUpdate}
            className='flex flex-col gap-3 sm:flex-row sm:items-end'
          >
            <div className='flex-1'>
              {pendingEmail ? (
                <div>
                  <label
                    htmlFor='verify-code'
                    className='mb-1.5 block text-app text-primary-token'
                  >
                    Verification code
                  </label>
                  <Input
                    id='verify-code'
                    inputMode='numeric'
                    pattern='[0-9]*'
                    maxLength={6}
                    value={verificationCode}
                    onChange={event => setVerificationCode(event.target.value)}
                    placeholder='Enter 6-digit code'
                    className='h-8 border-subtle bg-surface-0 text-app'
                    required
                  />
                </div>
              ) : (
                <div>
                  <label
                    htmlFor='new-email'
                    className='mb-1.5 block text-app text-primary-token'
                  >
                    Add email address
                  </label>
                  <Input
                    id='new-email'
                    type='email'
                    value={newEmail}
                    placeholder='you@example.com'
                    onChange={event => setNewEmail(event.target.value)}
                    className='h-8 border-subtle bg-surface-0 text-app'
                    required
                  />
                </div>
              )}
              {emailError ? (
                <p className='mt-1.5 text-app text-destructive'>{emailError}</p>
              ) : null}
            </div>
            <div className='flex shrink-0 gap-2'>
              <Button
                type='submit'
                size='sm'
                disabled={
                  emailStatus === 'sending' || emailStatus === 'verifying'
                }
                className='h-7 rounded-[8px] px-2.5 text-2xs font-caption'
              >
                {emailButtonLabel}
              </Button>
              {pendingEmail ? (
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  onClick={resetEmailForm}
                  className='h-7 rounded-[8px] border border-transparent px-2.5 text-2xs font-caption text-secondary-token hover:border-(--linear-app-frame-seam) hover:bg-surface-0 hover:text-primary-token'
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        </div>
      </DashboardCard>

      <ConfirmDialog
        open={Boolean(emailToRemove)}
        onOpenChange={open => {
          if (!open) setEmailToRemove(null);
        }}
        title='Remove email address?'
        description={`This will remove ${emailToRemove?.emailAddress ?? 'this email'} from your account.`}
        confirmLabel='Remove'
        variant='destructive'
        onConfirm={async () => {
          if (emailToRemove) await handleRemoveEmail(emailToRemove);
        }}
      />
    </>
  );
}
