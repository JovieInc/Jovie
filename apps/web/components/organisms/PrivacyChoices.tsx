'use client';

import { Button, Switch } from '@jovie/ui';
import { useState } from 'react';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import { saveConsent } from '@/lib/cookies/consent';
import {
  GPC_CONFIRMATION,
  PRIVACY_CHOICES_LABEL,
} from '@/lib/cookies/consent-state';
import {
  isGPCEnabled,
  isMarketingAllowed,
  setConsentState,
} from '@/lib/tracking/consent';

export function PrivacyChoices({ onClose }: Readonly<{ onClose: () => void }>) {
  const gpc = isGPCEnabled();
  const [optedOut, setOptedOut] = useState(() => !isMarketingAllowed());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const change = async (checked: boolean) => {
    if (gpc) return;
    const consent = { essential: true, analytics: false, marketing: !checked };
    // Apply withdrawal before the network request. A failed server save must
    // never re-enable advertising; the first-party cookie also covers blocked storage.
    setConsentState(checked ? 'rejected' : 'accepted');
    try {
      localStorage.setItem('jv_cc', JSON.stringify(consent));
    } catch {
      // The existing tracking-consent cookie is the persistent fallback.
    }
    globalThis.JVConsent?._emit(consent);
    setOptedOut(checked);
    setSaving(true);
    setError(false);
    try {
      await saveConsent(consent);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} size='xs'>
      <DialogTitle>Your Privacy Choices</DialogTitle>
      <DialogDescription>
        Control the use of this browser&apos;s information for advertising.
      </DialogDescription>
      <DialogBody>
        <div className='flex items-center justify-between gap-4 py-2'>
          <span
            id='privacy-opt-out-label'
            className='text-sm text-primary-token'
          >
            {PRIVACY_CHOICES_LABEL}
          </span>
          <Switch
            aria-labelledby='privacy-opt-out-label'
            checked={optedOut}
            disabled={gpc || saving}
            onCheckedChange={checked => void change(checked)}
          />
        </div>
        <p className='mt-2 text-xs text-secondary-token'>
          {gpc
            ? GPC_CONFIRMATION
            : 'Global Privacy Control is not detected in this browser.'}
        </p>
        <div
          className='mt-2 min-h-12 text-xs text-secondary-token'
          aria-live='polite'
        >
          {error ? (
            <p role='alert'>
              We could not sync your preferences. Your choice is applied in this
              browser.
            </p>
          ) : (
            <p>
              {saving
                ? 'Saving preferences…'
                : optedOut
                  ? 'Sale and sharing for advertising are turned off in this browser.'
                  : 'Sale and sharing for advertising are allowed in this browser.'}
            </p>
          )}
        </div>
      </DialogBody>
      <DialogActions>
        <Button variant='secondary' onClick={onClose}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
