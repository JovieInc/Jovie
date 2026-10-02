'use client';

import { Button } from '@jovie/ui';
import { useState } from 'react';
import { HudStatusPill } from '@/app/app/(shell)/admin/ops/HudStatusPill';
import {
  DrawerPropertyRow,
  DrawerSection,
} from '@/components/molecules/drawer';

/**
 * Receipt for the one canonical recovery operation: Summer reconcile
 * (`GET /api/ovie/summer/reconcile`). The server enforces founder auth,
 * production origin, deployment pinning, and idempotent persistence — the
 * browser only requests it and reports the effective outcome.
 */
export type ReconcileReceipt =
  | {
      readonly kind: 'persisted';
      readonly persisted: 'created' | 'existing';
      readonly eventId: string;
    }
  | { readonly kind: 'denied'; readonly code: string; readonly status: number };

type ReconcileResponse =
  | {
      readonly ok: true;
      readonly persisted: 'created' | 'existing';
      readonly result?: { readonly eventId?: unknown };
    }
  | { readonly ok: false; readonly code?: unknown };

export async function requestSummerReconcile(
  fetcher: typeof fetch = fetch
): Promise<ReconcileReceipt> {
  let response: Response;
  try {
    response = await fetcher('/api/ovie/summer/reconcile', {
      method: 'GET',
      cache: 'no-store',
    });
  } catch {
    return { kind: 'denied', code: 'request_failed', status: 0 };
  }
  let body: ReconcileResponse | null = null;
  try {
    body = (await response.json()) as ReconcileResponse;
  } catch {
    body = null;
  }
  if (response.ok && body?.ok === true) {
    const eventId = body.result?.eventId;
    return {
      kind: 'persisted',
      persisted: body.persisted === 'existing' ? 'existing' : 'created',
      eventId: typeof eventId === 'string' ? eventId : 'unknown',
    };
  }
  return {
    kind: 'denied',
    code:
      body && body.ok === false && typeof body.code === 'string'
        ? body.code
        : 'unexpected_response',
    status: response.status,
  };
}

const DENIAL_MESSAGES: Readonly<Record<string, string>> = {
  founder_session_unavailable:
    'Recovery denied — no founder session is available.',
  founder_identity_unconfigured:
    'Recovery unavailable — founder identity is not configured.',
  founder_access_required: 'Recovery denied — founder access is required.',
  production_origin_required:
    'Recovery unavailable — this operation only runs from the production origin.',
  summer_pin_invalid:
    'Recovery unavailable — the pinned Summer deployment could not be verified.',
  unverified_eve_deployment:
    'Recovery unavailable — the upstream runtime deployment is unverified.',
  summer_result_unavailable:
    'Provider outage — the Summer result could not be reached.',
  summer_result_pending:
    'Not yet effective — the upstream result is still pending.',
  summer_result_binding_drift:
    'Stale precondition — the observed result no longer matches the pinned target.',
  invalid_summer_result: 'Stale precondition — the result failed validation.',
  summer_result_not_completed:
    'Not yet effective — the upstream result has not completed.',
  persisted_result_drift:
    'Stale precondition — persisted receipt drifted from the observed result.',
  summer_result_persistence_failed:
    'Persistence failed — the receipt could not be durably stored.',
  request_failed: 'Request failed — the recovery endpoint was unreachable.',
  unexpected_response: 'Unexpected response from the recovery endpoint.',
};

function denialMessage(code: string): string {
  return DENIAL_MESSAGES[code] ?? `Recovery denied (${code}).`;
}

export function SummerReconcileSection({
  indicated,
}: Readonly<{ readonly indicated: boolean }>) {
  const [requesting, setRequesting] = useState(false);
  const [receipt, setReceipt] = useState<ReconcileReceipt | null>(null);

  const request = async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      setReceipt(await requestSummerReconcile());
    } finally {
      setRequesting(false);
    }
  };

  return (
    <DrawerSection title='Canonical recovery' sectionKind='details'>
      {!indicated ? (
        <p className='px-1 text-xs text-tertiary-token'>
          No recovery indicated for this task — no authorized operation applies.
          This item stays read-only.
        </p>
      ) : (
        <>
          <p className='px-1 text-xs text-tertiary-token'>
            Reconcile is the one permitted recovery: server-enforced, bound to a
            pinned recovery target, and idempotent. Repeated requests return the
            existing receipt instead of duplicating effects.
          </p>
          <DrawerPropertyRow
            label='Operation'
            value={
              <Button
                type='button'
                variant='secondary'
                size='sm'
                disabled={requesting}
                onClick={() => void request()}
                data-testid='summer-reconcile-request'
              >
                {requesting ? 'Requesting…' : 'Request reconcile'}
              </Button>
            }
          />
          {receipt ? (
            <DrawerPropertyRow
              label='Receipt'
              value={
                receipt.kind === 'persisted' ? (
                  <span
                    className='inline-flex items-center gap-1.5'
                    data-testid='summer-reconcile-receipt'
                  >
                    <HudStatusPill
                      label={
                        receipt.persisted === 'existing'
                          ? 'Already recorded'
                          : 'Recorded'
                      }
                      tone='good'
                    />
                    <span className='text-2xs text-tertiary-token'>
                      {receipt.eventId}
                    </span>
                  </span>
                ) : (
                  <span
                    className='text-xs text-error'
                    data-testid='summer-reconcile-denial'
                  >
                    {denialMessage(receipt.code)}
                  </span>
                )
              }
            />
          ) : null}
        </>
      )}
    </DrawerSection>
  );
}
