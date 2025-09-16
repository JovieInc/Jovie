'use client';

import type {
  EmailAddressResource,
  SessionWithActivitiesResource,
} from '@clerk/nextjs';
import { useSession, useUser } from '@clerk/nextjs';
import {
  CheckCircleIcon,
  EnvelopeIcon,
  KeyIcon,
  ShieldExclamationIcon,
  SignalSlashIcon,
} from '@heroicons/react/24/outline';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { useToast } from '@/components/ui/ToastContainer';
import { cn } from '@/lib/utils';
import { DashboardCard } from '../atoms/DashboardCard';

function formatRelativeDate(value: Date | null | undefined) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const diff = date.getTime() - Date.now();
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 60) {
    return formatter.format(minutes, 'minute');
  }
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) {
    return formatter.format(hours, 'hour');
  }
  const days = Math.round(hours / 24);
  return formatter.format(days, 'day');
}

function extractErrorMessage(error: unknown): string {
  if (!error) return 'Something went wrong. Please try again.';
  if (error instanceof Error) {
    return error.message || 'Something went wrong. Please try again.';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'object' && error !== null && 'errors' in error) {
    const clerkErrors = (error as { errors?: Array<{ message?: string }> })
      .errors;
    if (Array.isArray(clerkErrors) && clerkErrors.length > 0) {
      return clerkErrors[0]?.message ?? 'Unable to complete request.';
    }
  }
  return 'Something went wrong. Please try again.';
}

export function AccountSettingsSection() {
  const { user, isLoaded } = useUser();
  const { session: activeSession } = useSession();
  const { showToast } = useToast();

  const [newEmail, setNewEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState<EmailAddressResource | null>(
    null
  );
  const [emailStatus, setEmailStatus] = useState<
    'idle' | 'sending' | 'code' | 'verifying'
  >('idle');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [syncingEmailId, setSyncingEmailId] = useState<string | null>(null);

  const [sessions, setSessions] = useState<SessionWithActivitiesResource[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [endingSessionId, setEndingSessionId] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [passwordStatus, setPasswordStatus] = useState<'idle' | 'saving'>(
    'idle'
  );
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSessions() {
      if (!isLoaded || !user) {
        return;
      }

      setSessionsLoading(true);
      setSessionsError(null);

      try {
        const userSessions = await user.getSessions();
        if (!cancelled) {
          setSessions(userSessions ?? []);
        }
      } catch (error) {
        if (!cancelled) {
          setSessionsError('Unable to load active sessions right now.');
          console.error('Failed to load sessions:', error);
        }
      } finally {
        if (!cancelled) {
          setSessionsLoading(false);
        }
      }
    }

    void loadSessions();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, user]);

  const primaryEmailId = user?.primaryEmailAddressId ?? null;
  const sortedEmails = useMemo(() => {
    if (!user) return [] as EmailAddressResource[];
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
  }, [user, primaryEmailId]);

  const resetEmailForm = () => {
    setNewEmail('');
    setVerificationCode('');
    setPendingEmail(null);
    setEmailStatus('idle');
    setEmailError(null);
  };

  const syncEmailToDatabase = async (email: string) => {
    const response = await fetch('/api/account/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: '' }));
      throw new Error(
        data.error || 'Failed to sync email address with our database.'
      );
    }
  };

  const handleStartEmailUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;

    setEmailStatus('sending');
    setEmailError(null);

    try {
      const createdEmail = await user.createEmailAddress({ email: newEmail });
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

    if (!user || !pendingEmail) {
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

  const handleMakePrimary = async (email: EmailAddressResource) => {
    if (!user) return;
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

  const handleRemoveEmail = async (email: EmailAddressResource) => {
    if (!user) return;
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

  const handlePasswordUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    setPasswordStatus('saving');
    setPasswordError(null);

    try {
      await user.updatePassword({
        currentPassword,
        newPassword,
        signOutOfOtherSessions: signOutOthers,
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast({
        type: 'success',
        message: 'Password updated successfully.',
      });
    } catch (error) {
      const message = extractErrorMessage(error);
      setPasswordError(message);
    } finally {
      setPasswordStatus('idle');
    }
  };

  const handleEndSession = async (session: SessionWithActivitiesResource) => {
    setEndingSessionId(session.id);
    try {
      await session.revoke();
      setSessions(prev => prev.filter(item => item.id !== session.id));
      showToast({
        type: 'success',
        message: 'Session ended successfully.',
      });
    } catch (error) {
      const message = extractErrorMessage(error);
      showToast({ type: 'error', message });
    } finally {
      setEndingSessionId(null);
    }
  };

  if (!isLoaded || !user) {
    return (
      <DashboardCard variant='settings'>
        <div className='space-y-4'>
          <LoadingSkeleton height='h-6' width='w-1/3' />
          <LoadingSkeleton height='h-4' />
          <LoadingSkeleton height='h-12' />
          <LoadingSkeleton height='h-6' width='w-1/2' />
        </div>
      </DashboardCard>
    );
  }

  return (
    <div className='space-y-6'>
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
              onSubmit={
                pendingEmail ? handleVerifyEmail : handleStartEmailUpdate
              }
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

              {emailError && (
                <p className='text-sm text-red-500'>{emailError}</p>
              )}

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
                  <Button
                    type='button'
                    variant='ghost'
                    onClick={resetEmailForm}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard variant='settings'>
        <div className='flex items-start justify-between gap-6'>
          <div className='flex-1'>
            <h3 className='text-lg font-semibold text-primary flex items-center gap-2'>
              <KeyIcon className='h-5 w-5 text-accent' />
              Password & security
            </h3>
            <p className='mt-1 text-sm text-secondary max-w-lg'>
              Choose a strong password to safeguard your account. You can also
              automatically sign out sessions on other devices after updating
              it.
            </p>
          </div>
        </div>

        <form onSubmit={handlePasswordUpdate} className='mt-6 space-y-4'>
          <FormField label='Current password' required>
            <Input
              type='password'
              value={currentPassword}
              onChange={event => setCurrentPassword(event.target.value)}
              placeholder='Enter your current password'
              required
            />
          </FormField>

          <FormField label='New password' required>
            <Input
              type='password'
              value={newPassword}
              onChange={event => setNewPassword(event.target.value)}
              placeholder='Create a new password'
              required
            />
          </FormField>

          <FormField label='Confirm new password' required>
            <Input
              type='password'
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              placeholder='Re-enter new password'
              required
            />
          </FormField>

          <label className='flex items-start gap-3 rounded-lg border border-subtle bg-surface-0 p-3 text-sm text-secondary'>
            <input
              type='checkbox'
              className='mt-1'
              checked={signOutOthers}
              onChange={event => setSignOutOthers(event.target.checked)}
            />
            <span>
              Sign out other sessions after updating my password
              <span className='block text-xs text-tertiary mt-1'>
                Recommended if you suspect someone else has access to your
                account.
              </span>
            </span>
          </label>

          {passwordError && (
            <p className='text-sm text-red-500'>{passwordError}</p>
          )}

          <div className='flex justify-end gap-2'>
            <Button type='submit' disabled={passwordStatus === 'saving'}>
              {passwordStatus === 'saving' ? 'Updating…' : 'Update password'}
            </Button>
          </div>
        </form>
      </DashboardCard>

      <DashboardCard variant='settings'>
        <div className='flex items-start justify-between gap-6'>
          <div className='flex-1'>
            <h3 className='text-lg font-semibold text-primary flex items-center gap-2'>
              <SignalSlashIcon className='h-5 w-5 text-accent' />
              Active sessions
            </h3>
            <p className='mt-1 text-sm text-secondary max-w-lg'>
              Keep an eye on the devices signed in to your account. End sessions
              you no longer recognise.
            </p>
          </div>
        </div>

        {sessionsLoading ? (
          <div className='mt-6 space-y-3'>
            <LoadingSkeleton height='h-12' />
            <LoadingSkeleton height='h-12' />
          </div>
        ) : sessionsError ? (
          <div className='mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600'>
            {sessionsError}
          </div>
        ) : sessions.length === 0 ? (
          <div className='mt-6 rounded-lg border border-subtle bg-surface-0 px-4 py-6 text-center text-sm text-secondary'>
            You have no other active sessions.
          </div>
        ) : (
          <div className='mt-6 space-y-3'>
            {sessions.map(session => {
              const isCurrent = session.id === activeSession?.id;
              const activity = session.latestActivity;

              return (
                <div
                  key={session.id}
                  className={cn(
                    'flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border border-subtle px-4 py-3 bg-surface-1',
                    isCurrent && 'border-accent'
                  )}
                >
                  <div>
                    <p className='text-sm font-semibold text-primary flex items-center gap-2'>
                      {isCurrent
                        ? 'This device'
                        : activity?.browserName || 'Unknown device'}
                      {isCurrent && (
                        <span className='inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent'>
                          Current session
                        </span>
                      )}
                    </p>
                    <p className='text-xs text-secondary mt-1'>
                      Last active {formatRelativeDate(session.lastActiveAt)}
                      {activity?.city && activity?.country
                        ? ` · ${activity.city}, ${activity.country}`
                        : ''}
                    </p>
                  </div>

                  {!isCurrent && (
                    <Button
                      variant='ghost'
                      size='sm'
                      className='text-red-500 hover:text-red-600 hover:bg-red-50'
                      disabled={endingSessionId === session.id}
                      onClick={() => handleEndSession(session)}
                    >
                      {endingSessionId === session.id
                        ? 'Ending…'
                        : 'End session'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DashboardCard>
    </div>
  );
}
