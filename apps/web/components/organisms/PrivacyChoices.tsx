'use client';

import { Button, Switch } from '@jovie/ui';
import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import { shouldSuppressCookieBannerForPathname } from '@/lib/cookies/banner-visibility';
import { saveConsent } from '@/lib/cookies/consent';
import {
  GPC_CONFIRMATION,
  PRIVACY_CHOICES_LABEL,
} from '@/lib/cookies/consent-state';
import { usePublicPathname } from '@/lib/navigation/use-public-pathname';
import {
  isAnalyticsAllowed,
  isDNTEnabled,
  isGPCEnabled,
  isMarketingAllowed,
  setConsentState,
} from '@/lib/tracking/consent';

/** Keep the visitor's existing analytics choice when only advertising changes. */
function currentAnalyticsChoice(): boolean {
  try {
    const raw = localStorage.getItem('jv_cc');
    if (raw) {
      const stored = JSON.parse(raw) as { analytics?: unknown };
      if (typeof stored?.analytics === 'boolean') return stored.analytics;
    }
  } catch {
    // Fall through to the consent helper, which handles unreadable storage.
  }
  return isAnalyticsAllowed();
}

export function PrivacyChoices({ onClose }: Readonly<{ onClose: () => void }>) {
  const gpc = isGPCEnabled();
  const dnt = !gpc && isDNTEnabled();
  const signalLocked = gpc || dnt;
  const [optedOut, setOptedOut] = useState(() => !isMarketingAllowed());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const change = async (checked: boolean) => {
    if (signalLocked) return;
    const consent = {
      essential: true,
      analytics: currentAnalyticsChoice(),
      marketing: !checked,
    };
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
            disabled={signalLocked || saving}
            onCheckedChange={checked => void change(checked)}
          />
        </div>
        <p className='mt-2 text-xs text-secondary-token'>
          {gpc
            ? GPC_CONFIRMATION
            : dnt
              ? 'Do Not Track is enabled in this browser, so advertising stays off.'
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

/**
 * Lazily mounted by CookieBannerMount: opens the dialog from footer/menu
 * links and the #privacy-choices hash, and confirms an active GPC signal.
 */
export function PrivacyChoicesHost({
  open,
  onClose,
}: Readonly<{ open: boolean; onClose: () => void }>) {
  const [gpc, setGpc] = useState(false);
  const pathname = usePublicPathname();

  useEffect(() => {
    setGpc(isGPCEnabled());
  }, []);

  if (open) return <PrivacyChoices onClose={onClose} />;
  if (!gpc || shouldSuppressCookieBannerForPathname(pathname)) return null;
  return (
    <aside
      aria-label='Privacy Signal'
      className='fixed bottom-24 left-4 right-4 z-banner max-w-85 sm:left-auto rounded-xl border border-subtle bg-surface-1 px-4 py-3 text-xs text-secondary-token shadow-card'
    >
      <p role='status'>{GPC_CONFIRMATION}</p>
    </aside>
  );
}
