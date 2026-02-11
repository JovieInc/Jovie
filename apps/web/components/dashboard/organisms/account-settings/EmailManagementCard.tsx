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
import { FormField } from '@/components/molecules/FormField';

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

  return (
    <DashboardCard variant='settings'>
      <div className='flex items-start justify-between gap-4 sm:gap-6'>
        <div className='flex-1'>
          <h3 className='text-[13px] sm:text-[14px] font-medium text-primary-token'>
            Email addresses
          </h3>
          <p className='mt-0.5 sm:mt-1 text-xs sm:text-[13px] text-secondary-token max-w-lg'>
            Manage the email addresses tied to your account. Set a verified
            email as primary to use it for sign-in and notifications.
          </p>
        </div>
      </div>

      <div className='mt-3 sm:mt-6 space-y-4 sm:space-y-6'>
        <div className='space-y-2 sm:space-y-3'>
          {sortedEmails.map(email => {
            const isPrimary = email.id === primaryEmailId;
            const isVerified = email.verification?.status === 'verified';

            return (
              <div
                key={email.id}
                className='flex flex-col sm:flex-row sm:items-center justify-between rounded-lg sm:rounded-xl border border-subtle px-3 py-2.5 sm:px-4 sm:py-3 bg-surface-1 gap-2 sm:gap-3'
              >
                <div>
                  <p className='text-sm font-medium text-primary flex items-center gap-2'>
                    {email.emailAddress}
                    {isPrimary && (
                      <span className='inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent'>
                        Primary
                      </span>
                    )}
                  </p>
                  <p className='text-xs text-secondary flex items-center gap-2 mt-1'>
                    {isVerified ? (
                      <span className='inline-flex items-center gap-1 text-emerald-600'>
                        <CheckCircle className='h-4 w-4' />
                        Verified
                      </span>
                    ) : (
                      <span className='inline-flex items-center gap-1 text-amber-600'>
                        <ShieldAlert className='h-4 w-4' />
                        Verification required
                      </span>
                    )}
                  </p>
                </div>

                <div className='flex items-center gap-2'>
                  {!isPrimary && isVerified && (
                    <Button
                      variant='ghost'
                      size='sm'
                      disabled={syncingEmailId === email.id}
                      onClick={() => handleMakePrimary(email)}
                    >
                      {syncingEmailId === email.id
                        ? 'Updating…'
                        : 'Make primary'}
                    </Button>
                  )}
                  {!isPrimary && (
                    <Button
                      variant='ghost'
                      size='sm'
                      className='text-red-500 hover:text-red-600 hover:bg-red-50'
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
        </div>

        <div className='rounded-lg sm:rounded-xl border border-dashed border-subtle bg-surface-0 p-3 sm:p-4'>
          <h4 className='text-[13px] sm:text-sm font-semibold text-primary'>
            Add a new email
          </h4>
          <p className='text-xs text-secondary mt-0.5 sm:mt-1'>
            We will send a six-digit confirmation code to verify ownership.
          </p>

          <form
            onSubmit={pendingEmail ? handleVerifyEmail : handleStartEmailUpdate}
            className='mt-3 sm:mt-4 space-y-2.5 sm:space-y-3'
          >
            {!pendingEmail && (
              <FormField label='New email address' required>
                <Input
                  type='email'
                  value={newEmail}
                  placeholder='you@example.com'
                  onChange={event => setNewEmail(event.target.value)}
                  required
                />
              </FormField>
            )}

            {pendingEmail && (
              <FormField label='Verification code' required>
                <Input
                  inputMode='numeric'
                  pattern='[0-9]*'
                  maxLength={6}
                  value={verificationCode}
                  onChange={event => setVerificationCode(event.target.value)}
                  placeholder='Enter 6-digit code'
                  required
                />
              </FormField>
            )}

            {emailError && <p className='text-sm text-red-500'>{emailError}</p>}

            <div className='flex flex-wrap gap-2'>
              <Button
                type='submit'
                disabled={
                  emailStatus === 'sending' || emailStatus === 'verifying'
                }
              >
                {(() => {
                  if (pendingEmail) {
                    return emailStatus === 'verifying'
                      ? 'Verifying…'
                      : 'Confirm email';
                  }
                  return emailStatus === 'sending'
                    ? 'Sending…'
                    : 'Send verification';
                })()}
              </Button>
              {pendingEmail && (
                <Button type='button' variant='ghost' onClick={resetEmailForm}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </div>
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
