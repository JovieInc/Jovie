'use client';

/**
 * EmailManagementCard Component
 *
 * Manages email addresses tied to the user's account.
 * Allows adding, verifying, and removing email addresses.
 */

import {
  CheckCircleIcon,
  EnvelopeIcon,
  ShieldExclamationIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@jovie/ui';
import { useMemo, useState } from 'react';

import { Input } from '@/components/atoms/Input';
import { FormField } from '@/components/molecules/FormField';
import { useToast } from '@/components/molecules/ToastContainer';

import { DashboardCard } from '../../atoms/DashboardCard';
import type {
  ClerkEmailAddressResource,
  ClerkUserResource,
  EmailStatus,
} from './types';
import { extractErrorMessage, syncEmailToDatabase } from './utils';

export interface EmailManagementCardProps {
  user: ClerkUserResource;
}

export function EmailManagementCard({ user }: EmailManagementCardProps) {
  const { showToast } = useToast();

  const [newEmail, setNewEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [pendingEmail, setPendingEmail] =
    useState<ClerkEmailAddressResource | null>(null);
  const [emailStatus, setEmailStatus] = useState<EmailStatus>('idle');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [syncingEmailId, setSyncingEmailId] = useState<string | null>(null);

  const primaryEmailId = user.primaryEmailAddressId ?? null;

  const sortedEmails = useMemo(() => {
    const addresses = [...user.emailAddresses];
    return addresses.sort((a, b) => {
      if (a.id === primaryEmailId) return -1;
      if (b.id === primaryEmailId) return 1;
      const aVerified = a.verification?.status === 'verified';
      const bVerified = b.verification?.status === 'verified';
      if (aVerified && !bVerified) return -1;
      if (!aVerified && bVerified) return 1;
      return a.emailAddress.localeCompare(b.emailAddress);
    });
  }, [user.emailAddresses, primaryEmailId]);

  const resetEmailForm = () => {
    setNewEmail('');
    setVerificationCode('');
    setPendingEmail(null);
    setEmailStatus('idle');
    setEmailError(null);
  };

  const handleStartEmailUpdate = async (event: React.FormEvent) => {
    event.preventDefault();

    setEmailStatus('sending');
    setEmailError(null);

    try {
      const createdEmail = await user.createEmailAddress({
        email: newEmail,
      });
      setPendingEmail(createdEmail);
      await createdEmail.prepareVerification({ strategy: 'email_code' });
      setEmailStatus('code');
      showToast({
        type: 'success',
        message: `Verification code sent to ${newEmail}`,
      });
    } catch (error) {
      const message = extractErrorMessage(error);
      setEmailStatus('idle');
      setEmailError(message);
    }
  };

  const handleVerifyEmail = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!pendingEmail) {
      return;
    }

    setEmailStatus('verifying');
    setEmailError(null);

    try {
      const verifiedEmail = await pendingEmail.attemptVerification({
        code: verificationCode.trim(),
      });

      if (verifiedEmail.verification?.status !== 'verified') {
        throw new Error('Verification code is invalid or expired.');
      }

      setSyncingEmailId(verifiedEmail.id);
      await user.update({ primaryEmailAddressId: verifiedEmail.id });
      await syncEmailToDatabase(verifiedEmail.emailAddress);
      await user.reload();
      resetEmailForm();
      setSyncingEmailId(null);
      showToast({
        type: 'success',
        message: 'Primary email updated successfully.',
      });
    } catch (error) {
      const message = extractErrorMessage(error);
      setEmailStatus('code');
      setEmailError(message);
      setSyncingEmailId(null);
    }
  };

  const handleMakePrimary = async (email: ClerkEmailAddressResource) => {
    setSyncingEmailId(email.id);

    try {
      await user.update({ primaryEmailAddressId: email.id });
      await syncEmailToDatabase(email.emailAddress);
      await user.reload();
      showToast({
        type: 'success',
        message: 'Primary email updated.',
      });
    } catch (error) {
      const message = extractErrorMessage(error);
      showToast({ type: 'error', message });
    } finally {
      setSyncingEmailId(null);
    }
  };

  const handleRemoveEmail = async (email: ClerkEmailAddressResource) => {
    setSyncingEmailId(email.id);
    try {
      await email.destroy();
      await user.reload();
      showToast({ type: 'success', message: 'Email removed.' });
    } catch (error) {
      const message = extractErrorMessage(error);
      showToast({ type: 'error', message });
    } finally {
      setSyncingEmailId(null);
    }
  };

  return (
    <DashboardCard variant='settings'>
      <div className='flex items-start justify-between gap-6'>
        <div className='flex-1'>
          <h3 className='text-lg font-semibold text-primary flex items-center gap-2'>
            <EnvelopeIcon className='h-5 w-5 text-accent' />
            Email addresses
          </h3>
          <p className='mt-1 text-sm text-secondary max-w-lg'>
            Manage the email addresses tied to your account. Set a verified
            email as primary to use it for sign-in and notifications.
          </p>
        </div>
      </div>

      <div className='mt-6 space-y-6'>
        <div className='space-y-3'>
          {sortedEmails.map(email => {
            const isPrimary = email.id === primaryEmailId;
            const isVerified = email.verification?.status === 'verified';

            return (
              <div
                key={email.id}
                className='flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border border-subtle px-4 py-3 bg-surface-1 gap-3'
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
                        <CheckCircleIcon className='h-4 w-4' />
                        Verified
                      </span>
                    ) : (
                      <span className='inline-flex items-center gap-1 text-amber-600'>
                        <ShieldExclamationIcon className='h-4 w-4' />
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
                      onClick={() => handleRemoveEmail(email)}
                    >
                      {syncingEmailId === email.id ? 'Removing…' : 'Remove'}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className='rounded-xl border border-dashed border-subtle bg-surface-0 p-4'>
          <h4 className='text-sm font-semibold text-primary'>
            Add a new email
          </h4>
          <p className='text-xs text-secondary mt-1'>
            We will send a six-digit confirmation code to verify ownership.
          </p>

          <form
            onSubmit={pendingEmail ? handleVerifyEmail : handleStartEmailUpdate}
            className='mt-4 space-y-3'
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
                {pendingEmail
                  ? emailStatus === 'verifying'
                    ? 'Verifying…'
                    : 'Confirm email'
                  : emailStatus === 'sending'
                    ? 'Sending…'
                    : 'Send verification'}
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
    </DashboardCard>
  );
}
