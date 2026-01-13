'use client';

import { useMemo, useState } from 'react';
import { useNotifications } from '@/lib/hooks/useNotifications';
import type {
  ClerkEmailAddressResource,
  ClerkUserResource,
  EmailStatus,
} from './types';
import { extractErrorMessage, syncEmailToDatabase } from './utils';

export interface UseEmailManagementReturn {
  newEmail: string;
  setNewEmail: (email: string) => void;
  verificationCode: string;
  setVerificationCode: (code: string) => void;
  pendingEmail: ClerkEmailAddressResource | null;
  emailStatus: EmailStatus;
  emailError: string | null;
  syncingEmailId: string | null;
  primaryEmailId: string | null;
  sortedEmails: ClerkEmailAddressResource[];
  resetEmailForm: () => void;
  handleStartEmailUpdate: (event: React.FormEvent) => Promise<void>;
  handleVerifyEmail: (event: React.FormEvent) => Promise<void>;
  handleMakePrimary: (email: ClerkEmailAddressResource) => Promise<void>;
  handleRemoveEmail: (email: ClerkEmailAddressResource) => Promise<void>;
}

export function useEmailManagement(
  user: ClerkUserResource
): UseEmailManagementReturn {
  const notifications = useNotifications();
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
      notifications.success(`Verification code sent to ${newEmail}`);
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
      notifications.success('Primary email updated');
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
      notifications.success('Primary email updated');
    } catch (error) {
      const message = extractErrorMessage(error);
      notifications.error(message);
    } finally {
      setSyncingEmailId(null);
    }
  };

  const handleRemoveEmail = async (email: ClerkEmailAddressResource) => {
    setSyncingEmailId(email.id);
    try {
      await email.destroy();
      await user.reload();
      notifications.success('Email removed');
    } catch (error) {
      const message = extractErrorMessage(error);
      notifications.error(message);
    } finally {
      setSyncingEmailId(null);
    }
  };

  return {
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
  };
}
