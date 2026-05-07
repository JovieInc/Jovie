'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useProfileNotifications } from '@/components/organisms/profile-shell/ProfileNotificationsContext';
import { track } from '@/lib/analytics';
import { SMS_CONSENT_TEXT } from '@/lib/notifications/sms-consent-shared';
import {
  useCreateSmsIntentMutation,
  useSmsIntentStatusQuery,
} from '@/lib/queries/useCreateSmsIntentMutation';
import { cn } from '@/lib/utils';

type Phase =
  | 'idle'
  | 'pending'
  | 'sms_handed_off'
  | 'awaiting_inbound'
  | 'awaiting_inbound_with_code'
  | 'confirmed'
  | 'expired'
  | 'error';

const POLL_FALLBACK_DEADLINE_MS = 90_000;
const REVEAL_CODE_AFTER_MS = 30_000;
const SMS_HANDOFF_DETECT_MS = 1500;

interface NativeSmsSubscribeButtonProps {
  readonly artistId: string;
  readonly source?: string;
  readonly className?: string;
  /** Called once the polling client confirms a successful subscription. */
  readonly onConfirmed?: (params: { phoneMasked?: string | null }) => void;
}

interface IntentSnapshot {
  intentId: string;
  code: string;
  smsHref: string | null;
  smsTo: string | null;
  expiresAt: string;
  createdAt: number;
}

/**
 * Primary CTA for native SMS subscribe handoff.
 *
 * State matrix (autoplan Phase 2 Pass 2):
 * - idle:                  initial render
 * - pending:               mutation in flight
 * - sms_handed_off:        navigator.location.href fired; waiting for blur race
 * - awaiting_inbound:      poll started, no sms: silent fail detected
 * - awaiting_inbound_with_code: 30s elapsed OR sms: silent fail; manual code shown
 * - confirmed:             status endpoint reports subscribed
 * - expired:               TTL hit; fan must restart
 * - error:                 mutation or polling failed
 */
export function NativeSmsSubscribeButton({
  artistId,
  source = 'profile_bell',
  className,
  onConfirmed,
}: NativeSmsSubscribeButtonProps) {
  const ctx = useProfileNotifications();
  const [phase, setPhase] = useState<Phase>('idle');
  const [intent, setIntent] = useState<IntentSnapshot | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const handoffStartRef = useRef<number | null>(null);

  const createIntent = useCreateSmsIntentMutation();

  const statusQuery = useSmsIntentStatusQuery({
    intentId: intent?.intentId ?? null,
    enabled:
      phase === 'awaiting_inbound' || phase === 'awaiting_inbound_with_code',
    pollIntervalMs: 2000,
  });

  useEffect(() => {
    if (!intent) return;
    if (
      phase !== 'awaiting_inbound' &&
      phase !== 'awaiting_inbound_with_code'
    ) {
      return;
    }
    const data = statusQuery.data;
    if (data?.status === 'confirmed') {
      setPhase('confirmed');
      ctx.setSubscribedChannels(prev => ({ ...prev, sms: true }));
      ctx.setSubscriptionDetails(prev => ({
        ...prev,
        sms: data.phone_masked ?? undefined,
      }));
      track('sms_subscription_confirmed', { artist_id: artistId });
      onConfirmed?.({ phoneMasked: data.phone_masked });
      return;
    }
    if (statusQuery.data?.status === 'expired') {
      setPhase('expired');
      track('sms_join_code_expired', { artist_id: artistId });
    }
  }, [intent, phase, statusQuery.data, artistId, ctx, onConfirmed]);

  useEffect(() => {
    if (phase !== 'awaiting_inbound') return;
    const t = window.setTimeout(() => {
      setPhase(current =>
        current === 'awaiting_inbound' ? 'awaiting_inbound_with_code' : current
      );
    }, REVEAL_CODE_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (
      phase !== 'awaiting_inbound' &&
      phase !== 'awaiting_inbound_with_code'
    ) {
      return;
    }
    if (!intent) return;
    // Trust the server's expires_at when present; fall back to a fixed
    // window only if the timestamp is missing/invalid (CodeRabbit major).
    const expiresAtMs = (() => {
      const parsed = new Date(intent.expiresAt).getTime();
      if (Number.isFinite(parsed)) return parsed;
      return intent.createdAt + POLL_FALLBACK_DEADLINE_MS;
    })();
    const t = window.setTimeout(
      () => {
        setPhase(current => (current === 'confirmed' ? current : 'expired'));
      },
      Math.max(0, expiresAtMs - Date.now())
    );
    return () => window.clearTimeout(t);
  }, [phase, intent]);

  /**
   * SMS deeplink silent-fail detection (codex / DES-N1 critical fix #2).
   * After the click, watch for blur or visibilitychange within 1500ms; if
   * neither fires the OS never handed control to Messages — surface the
   * manual code immediately so the fan isn't stranded.
   */
  useEffect(() => {
    if (phase !== 'sms_handed_off') return;
    const start = handoffStartRef.current ?? Date.now();
    let detected = false;

    const onBlur = () => {
      detected = true;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') detected = true;
    };

    window.addEventListener('blur', onBlur, { once: true });
    document.addEventListener('visibilitychange', onVisibility, {
      once: true,
    });

    const t = window.setTimeout(
      () => {
        window.removeEventListener('blur', onBlur);
        document.removeEventListener('visibilitychange', onVisibility);
        if (detected) {
          setPhase('awaiting_inbound');
        } else {
          // sms: silent fail (desktop / unsupported PWA). Show manual code.
          setPhase('awaiting_inbound_with_code');
        }
      },
      SMS_HANDOFF_DETECT_MS - (Date.now() - start)
    );

    return () => {
      window.clearTimeout(t);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [phase]);

  const handleClick = useCallback(async () => {
    if (phase !== 'idle' && phase !== 'expired' && phase !== 'error') return;
    setErrorMessage(null);
    setPhase('pending');
    track('sms_intent_create_attempt', { artist_id: artistId, source });
    try {
      const result = await createIntent.mutateAsync({ artistId, source });
      track('sms_intent_create_success', { artist_id: artistId });
      const snapshot: IntentSnapshot = {
        intentId: result.intent_id,
        code: result.code,
        smsHref: result.sms_href,
        smsTo: result.sms_to,
        expiresAt: result.expires_at,
        createdAt: Date.now(),
      };
      setIntent(snapshot);
      if (snapshot.smsHref) {
        handoffStartRef.current = Date.now();
        // Trigger native SMS app via location.href; the blur-race effect
        // detects whether the OS handoff actually happened.
        window.location.href = snapshot.smsHref;
        setPhase('sms_handed_off');
        track('sms_native_sms_opened', { artist_id: artistId });
      } else {
        // No outbound number configured (e.g. desktop preview without
        // TWILIO_FROM_NUMBER) — surface manual code straight away.
        setPhase('awaiting_inbound_with_code');
      }
    } catch (error) {
      track('sms_intent_create_error', {
        artist_id: artistId,
        message: error instanceof Error ? error.message : 'unknown',
      });
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Could not start SMS subscribe.'
      );
      setPhase('error');
    }
  }, [phase, artistId, source, createIntent]);

  const buttonLabel = (() => {
    switch (phase) {
      case 'pending':
        return 'Starting…';
      case 'confirmed':
        return "You're subscribed.";
      case 'expired':
        return 'Try again';
      case 'error':
        return 'Try again';
      default:
        return 'Get Release Alerts';
    }
  })();

  const showStatusRow =
    phase === 'sms_handed_off' ||
    phase === 'awaiting_inbound' ||
    phase === 'awaiting_inbound_with_code' ||
    phase === 'expired';

  const showCodeChip =
    phase === 'awaiting_inbound_with_code' || phase === 'expired';

  return (
    <div className={cn('flex flex-col items-stretch gap-2', className)}>
      <button
        type='button'
        onClick={handleClick}
        disabled={phase === 'pending'}
        className={cn(
          'inline-flex h-11 items-center justify-center gap-2 rounded-full px-4',
          'bg-[oklch(10%_0_0)] text-white',
          'text-[15px] font-medium tracking-[-0.165px]',
          'transition-colors duration-subtle',
          'hover:bg-[oklch(15%_0_0)]',
          'disabled:cursor-not-allowed disabled:opacity-60'
        )}
        aria-label={buttonLabel}
      >
        {buttonLabel}
      </button>

      {phase !== 'confirmed' && (
        <p className='text-center text-xs text-[var(--text-tertiary)] leading-snug'>
          {SMS_CONSENT_TEXT}
        </p>
      )}

      {showStatusRow && (
        <div
          role='status'
          aria-live='polite'
          className='text-center text-sm text-[var(--text-secondary)]'
        >
          {phase === 'sms_handed_off' || phase === 'awaiting_inbound'
            ? 'Send the text to subscribe.'
            : phase === 'awaiting_inbound_with_code'
              ? 'Still waiting. Or enter the code manually:'
              : "We didn't receive your text. Try again or enter your phone."}
        </div>
      )}

      {showCodeChip && intent && (
        <div className='flex flex-col items-center gap-1'>
          <span className='sr-only'>{`Verification code: ${intent.code.split('').join(' ')}`}</span>
          <span
            aria-hidden='true'
            className='rounded border px-3 py-2 font-mono text-[18px] font-medium tracking-wider'
          >
            {intent.code}
          </span>
          {intent.smsTo && (
            <a
              href={`sms:${intent.smsTo}?body=${encodeURIComponent('JOIN ' + intent.code)}`}
              className='text-sm text-[var(--accent)] underline-offset-2 hover:underline'
            >
              Text {intent.smsTo}
            </a>
          )}
        </div>
      )}

      {phase === 'confirmed' && (
        <div className='flex items-center justify-center gap-2 text-sm text-[var(--text-secondary)]'>
          <span>You&apos;re subscribed.</span>
          {ctx.subscriptionDetails?.sms && (
            <span className='text-[var(--text-tertiary)]'>
              ({ctx.subscriptionDetails.sms})
            </span>
          )}
        </div>
      )}

      {phase === 'error' && errorMessage && (
        <p
          role='alert'
          className='text-center text-sm text-[var(--color-status-danger,_#dc2626)]'
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}
