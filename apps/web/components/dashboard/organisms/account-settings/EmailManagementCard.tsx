'use client';

/**
 * EmailManagementCard Component
 *
 * Manages email addresses tied to the user's account.
 * Allows adding, verifying, and removing email addresses.
 */

import { Button, Input } from '@jovie/ui';
import { CheckCircle, ShieldAlert } from 'lucide-react';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';

import { DashboardCard } from '../../atoms/DashboardCard';
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
    <DashboardCard
      variant='settings'
      padding='none'
      className='divide-y divide-subtle'
    >
      {/* Existing email rows */}
      {sortedEmails.map(email => {
        const isPrimary = email.id === primaryEmailId;
        const isVerified = email.verification?.status === 'verified';

        return (
          <div
            key={email.id}
            className='flex items-center justify-between px-5 py-4'
          >
            <div className='flex items-center gap-3'>
              <div>
                <p className='text-sm text-primary-token flex items-center gap-2'>
                  {email.emailAddress}
                  {isPrimary && (
                    <span className='text-xs text-secondary-token'>
                      Primary
                    </span>
                  )}
                </p>
                <p className='text-xs text-secondary-token flex items-center gap-1.5 mt-0.5'>
                  {isVerified ? (
                    <span className='inline-flex items-center gap-1 text-emerald-600'>
                      <CheckCircle className='h-3.5 w-3.5' />
                      Verified
                    </span>
                  ) : (
                    <span className='inline-flex items-center gap-1 text-amber-600'>
                      <ShieldAlert className='h-3.5 w-3.5' />
                      Unverified
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className='flex items-center gap-2'>
              {!isPrimary && isVerified && (
                <Button
                  variant='ghost'
                  size='sm'
                  disabled={syncingEmailId === email.id}
                  onClick={() => handleMakePrimary(email)}
                >
                  {syncingEmailId === email.id ? 'Updating…' : 'Make primary'}
                </Button>
              )}
              {!isPrimary && (
                <Button
                  variant='ghost'
                  size='sm'
                  className='text-destructive hover:text-destructive hover:bg-destructive/10'
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

      {/* Add email row */}
      <div className='px-5 py-4'>
        <form
          onSubmit={pendingEmail ? handleVerifyEmail : handleStartEmailUpdate}
          className='flex flex-col gap-3 sm:flex-row sm:items-end'
        >
          <div className='flex-1'>
            {pendingEmail ? (
              <div>
                <label
                  htmlFor='verify-code'
                  className='block text-sm text-primary-token mb-1.5'
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
                  required
                />
              </div>
            ) : (
              <div>
                <label
                  htmlFor='new-email'
                  className='block text-sm text-primary-token mb-1.5'
                >
                  Add email address
                </label>
                <Input
                  id='new-email'
                  type='email'
                  value={newEmail}
                  placeholder='you@example.com'
                  onChange={event => setNewEmail(event.target.value)}
                  required
                />
              </div>
            )}
            {emailError && (
              <p className='text-sm text-destructive mt-1.5'>{emailError}</p>
            )}
          </div>
          <div className='flex gap-2 shrink-0'>
            <Button
              type='submit'
              size='sm'
              disabled={
                emailStatus === 'sending' || emailStatus === 'verifying'
              }
            >
              {emailButtonLabel}
            </Button>
            {pendingEmail && (
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={resetEmailForm}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </div>

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
    </DashboardCard>
  );
}
