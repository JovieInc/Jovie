'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';

interface MetadataAgentProvider {
  readonly id: string;
  readonly displayName: string;
  readonly transport: string;
  readonly requiredInputs: string[];
  readonly launchReady: boolean;
}

interface MetadataAgentMissingField {
  readonly field: string;
  readonly reason: string;
}

interface MetadataAgentIssue {
  readonly id: string;
  readonly field: string;
  readonly issueType: string;
  readonly severity: string;
  readonly expectedValue: string | null;
  readonly observedValue: string | null;
  readonly status: string;
}

interface MetadataAgentTarget {
  readonly id: string;
  readonly targetType: string;
  readonly canonicalUrl: string;
}

interface MetadataAgentRequest {
  readonly id: string;
  readonly providerId: string;
  readonly status: string;
  readonly createdAt: string;
  readonly approvedAt: string | null;
  readonly sentAt: string | null;
  readonly latestSnapshotAt: string | null;
  readonly providerMessageId: string | null;
  readonly lastError: string | null;
  readonly missingFields: MetadataAgentMissingField[];
  readonly issues: MetadataAgentIssue[];
  readonly targets: MetadataAgentTarget[];
}

interface MetadataAgentStatusResponse {
  readonly success?: boolean;
  readonly requests?: MetadataAgentRequest[];
  readonly storageAvailable?: boolean;
  readonly error?: string;
}

interface MetadataAgentPanelProps {
  readonly profileId: string;
  readonly releaseId: string;
  readonly releaseTitle: string;
}

type ActionState = 'idle' | 'loading' | 'error';

function formatStatusLabel(value: string): string {
  return value
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return 'Not yet';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function MetadataAgentPanel({
  profileId,
  releaseId,
  releaseTitle,
}: MetadataAgentPanelProps) {
  const [providers, setProviders] = useState<MetadataAgentProvider[]>([]);
  const [requests, setRequests] = useState<MetadataAgentRequest[]>([]);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<ActionState>('idle');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function loadPanelData() {
      setActionState('loading');
      setError(null);
      setStorageAvailable(true);

      try {
        const [providersResponse, statusResponse] = await Promise.all([
          fetch('/api/metadata-submissions/providers', { method: 'GET' }),
          fetch(
            `/api/metadata-submissions/status?profileId=${encodeURIComponent(
              profileId
            )}&releaseId=${encodeURIComponent(releaseId)}`,
            {
              method: 'GET',
            }
          ),
        ]);

        if (!providersResponse.ok || !statusResponse.ok) {
          throw new Error('Unable to load metadata agent state.');
        }

        const [providersPayload, statusPayload] = (await Promise.all([
          providersResponse.json(),
          statusResponse.json(),
        ])) as [
          { providers?: MetadataAgentProvider[] },
          MetadataAgentStatusResponse,
        ];

        if (cancelled) {
          return;
        }

        setProviders(providersPayload.providers ?? []);
        setRequests(statusPayload.requests ?? []);
        setStorageAvailable(statusPayload.storageAvailable !== false);
        if (statusPayload.storageAvailable === false) {
          setError(
            statusPayload.error ??
              'Metadata submission storage is not available in this environment.'
          );
        }
        setActionState('idle');
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        setActionState('error');
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Unable to load metadata agent state.'
        );
      }
    }

    void loadPanelData();

    return () => {
      cancelled = true;
    };
  }, [profileId, releaseId]);

  const launchProvider = useMemo(
    () =>
      providers.find(provider => provider.id === 'xperi_allmusic_email') ??
      null,
    [providers]
  );
  const latestRequest = requests[0] ?? null;
  const openIssues =
    latestRequest?.issues.filter(issue => issue.status === 'open') ?? [];
  const hasBlockingFields = (latestRequest?.missingFields.length ?? 0) > 0;

  const runAction = async (action: () => Promise<void>) => {
    setError(null);
    setActionState('loading');

    try {
      await action();
      setActionState('idle');
    } catch (actionError) {
      setActionState('error');
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Metadata agent request failed.'
      );
    }
  };

  const reloadStatus = async () => {
    const response = await fetch(
      `/api/metadata-submissions/status?profileId=${encodeURIComponent(
        profileId
      )}&releaseId=${encodeURIComponent(releaseId)}`,
      {
        method: 'GET',
      }
    );

    if (!response.ok) {
      throw new Error('Unable to refresh metadata submission status.');
    }

    const payload = (await response.json()) as MetadataAgentStatusResponse;
    startTransition(() => {
      setRequests(payload.requests ?? []);
      const available = payload.storageAvailable !== false;
      setStorageAvailable(available);
      if (!available) {
        setError(
          payload.error ??
            'Metadata submission storage is not available in this environment.'
        );
      }
    });
  };

  const handlePrepare = async () => {
    await runAction(async () => {
      const response = await fetch('/api/metadata-submissions/prepare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId,
          releaseId,
          providerIds: ['xperi_allmusic_email'],
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? 'Unable to prepare metadata package.');
      }

      await reloadStatus();
    });
  };

  const handleApproveSend = async () => {
    if (!latestRequest) {
      return;
    }

    await runAction(async () => {
      const response = await fetch('/api/metadata-submissions/approve-send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestId: latestRequest.id,
          confirmSend: true,
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? 'Unable to approve and send package.');
      }

      await reloadStatus();
    });
  };

  const handleDraftCorrection = async () => {
    if (!latestRequest) {
      return;
    }

    await runAction(async () => {
      const response = await fetch(
        '/api/metadata-submissions/draft-correction',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requestId: latestRequest.id,
          }),
        }
      );

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? 'Unable to draft correction package.');
      }

      await reloadStatus();
    });
  };

  let currentStatusLabel = 'Current Status: Unavailable';
  if (storageAvailable) {
    currentStatusLabel = latestRequest
      ? `Current Status: ${formatStatusLabel(latestRequest.status)}`
      : 'Current Status: Not Started';
  }

  let reviewLabel = 'Unavailable In This Environment';
  if (storageAvailable && hasBlockingFields) {
    reviewLabel = `${latestRequest?.missingFields.length ?? 0} blockers`;
  } else if (storageAvailable && latestRequest) {
    reviewLabel = 'Package prepared';
  } else if (storageAvailable) {
    reviewLabel = 'Package not prepared';
  }

  let reviewDescription =
    'Apply the metadata submission tables before running the agent in this environment.';
  if (storageAvailable && hasBlockingFields) {
    reviewDescription =
      'Fill the missing fields before Jovie can queue the submission.';
  } else if (storageAvailable) {
    reviewDescription =
      'Prepare the release sheet, images, and bio bundle before send approval.';
  }

  let trackingLabel = 'Tracking unavailable';
  if (storageAvailable) {
    trackingLabel = latestRequest?.targets.length
      ? `${latestRequest.targets.length} live targets`
      : 'No live targets yet';
  }

  return (
    <section className='mb-6 rounded-xl border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) p-4'>
      <div className='flex flex-col gap-2 md:flex-row md:items-start md:justify-between'>
        <div>
          <p className='text-[11px] font-medium uppercase tracking-[0.18em] text-tertiary-token'>
            Metadata Agent
          </p>
          <h2 className='mt-1 text-base font-semibold text-primary-token'>
            Xperi Submission Ops For {releaseTitle}
          </h2>
          <p className='mt-1 max-w-2xl text-sm text-secondary-token'>
            Prepare the Xperi or AllMusic package, approve the outbound send,
            and track live metadata drift from one release-scoped workflow.
          </p>
        </div>

        <div className='rounded-full border border-(--linear-app-frame-seam) px-3 py-1 text-xs font-medium text-secondary-token'>
          {currentStatusLabel}
        </div>
      </div>

      <div className='mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
        <div className='rounded-lg border border-(--linear-app-frame-seam) bg-surface-1 p-3'>
          <p className='text-[11px] font-medium uppercase tracking-wide text-tertiary-token'>
            Source Of Truth
          </p>
          <p className='mt-2 text-sm text-primary-token'>{releaseTitle}</p>
          <p className='mt-1 text-xs text-secondary-token'>
            Canonical release, track, artwork, and artist profile data from
            Jovie.
          </p>
        </div>

        <div className='rounded-lg border border-(--linear-app-frame-seam) bg-surface-1 p-3'>
          <p className='text-[11px] font-medium uppercase tracking-wide text-tertiary-token'>
            Destinations
          </p>
          <div className='mt-2 space-y-1 text-sm text-primary-token'>
            {(launchProvider ? [launchProvider] : providers)
              .filter(provider => provider.launchReady)
              .map(provider => (
                <p key={provider.id}>{provider.displayName}</p>
              ))}
          </div>
          <p className='mt-1 text-xs text-secondary-token'>
            Allowlisted only. No custom recipients.
          </p>
        </div>

        <div className='rounded-lg border border-(--linear-app-frame-seam) bg-surface-1 p-3'>
          <p className='text-[11px] font-medium uppercase tracking-wide text-tertiary-token'>
            Review
          </p>
          <p className='mt-2 text-sm text-primary-token'>{reviewLabel}</p>
          <p className='mt-1 text-xs text-secondary-token'>
            {reviewDescription}
          </p>
        </div>

        <div className='rounded-lg border border-(--linear-app-frame-seam) bg-surface-1 p-3'>
          <p className='text-[11px] font-medium uppercase tracking-wide text-tertiary-token'>
            Tracking
          </p>
          <p className='mt-2 text-sm text-primary-token'>{trackingLabel}</p>
          <p className='mt-1 text-xs text-secondary-token'>
            {storageAvailable
              ? 'Monitor live pages, target discovery, and correction-worthy drift.'
              : 'The tracking store is not provisioned on this database yet.'}
          </p>
        </div>
      </div>

      {storageAvailable ? (
        <div className='mt-4 flex flex-wrap gap-2'>
          <button
            type='button'
            onClick={() => {
              void handlePrepare();
            }}
            disabled={actionState === 'loading' || isPending}
            className='rounded-md bg-[var(--linear-accent,#5e6ad2)] px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60'
          >
            {latestRequest ? 'Rebuild Package' : 'Prepare Package'}
          </button>

          {latestRequest?.status === 'awaiting_approval' &&
          !hasBlockingFields ? (
            <button
              type='button'
              onClick={() => {
                void handleApproveSend();
              }}
              disabled={actionState === 'loading' || isPending}
              className='rounded-md border border-(--linear-app-frame-seam) px-3 py-2 text-sm font-medium text-primary-token disabled:cursor-not-allowed disabled:opacity-60'
            >
              Approve And Send
            </button>
          ) : null}

          {latestRequest && openIssues.length > 0 ? (
            <button
              type='button'
              onClick={() => {
                void handleDraftCorrection();
              }}
              disabled={actionState === 'loading' || isPending}
              className='rounded-md border border-(--linear-app-frame-seam) px-3 py-2 text-sm font-medium text-primary-token disabled:cursor-not-allowed disabled:opacity-60'
            >
              Draft Correction
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div
          className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
            storageAvailable
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-amber-200 bg-amber-50 text-amber-700'
          }`}
        >
          {error}
        </div>
      ) : null}

      {hasBlockingFields ? (
        <div className='mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3'>
          <p className='text-sm font-medium text-amber-900'>Missing Fields</p>
          <ul className='mt-2 space-y-2 text-sm text-amber-950'>
            {latestRequest?.missingFields.map(missingField => (
              <li key={`${missingField.field}-${missingField.reason}`}>
                <span className='font-medium'>
                  {formatStatusLabel(missingField.field)}
                </span>
                {': '}
                {missingField.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {latestRequest && (
        <div className='mt-4 grid gap-4 lg:grid-cols-2'>
          <div className='rounded-lg border border-(--linear-app-frame-seam) bg-surface-1 p-3'>
            <p className='text-[11px] font-medium uppercase tracking-wide text-tertiary-token'>
              Timeline
            </p>
            <div className='mt-2 space-y-2 text-sm text-primary-token'>
              <p>Prepared: {formatTimestamp(latestRequest.createdAt)}</p>
              <p>Approved: {formatTimestamp(latestRequest.approvedAt)}</p>
              <p>Sent: {formatTimestamp(latestRequest.sentAt)}</p>
              <p>
                Last Snapshot: {formatTimestamp(latestRequest.latestSnapshotAt)}
              </p>
            </div>
            {latestRequest.providerMessageId ? (
              <p className='mt-2 text-xs text-secondary-token'>
                Provider message ID: {latestRequest.providerMessageId}
              </p>
            ) : null}
            {latestRequest.lastError ? (
              <p className='mt-2 text-xs text-red-600'>
                {latestRequest.lastError}
              </p>
            ) : null}
          </div>

          <div className='rounded-lg border border-(--linear-app-frame-seam) bg-surface-1 p-3'>
            <p className='text-[11px] font-medium uppercase tracking-wide text-tertiary-token'>
              Tracking State
            </p>
            {latestRequest.targets.length > 0 ? (
              <ul className='mt-2 space-y-2 text-sm text-primary-token'>
                {latestRequest.targets.map(target => (
                  <li key={target.id}>
                    <a
                      href={target.canonicalUrl}
                      target='_blank'
                      rel='noreferrer'
                      className='underline decoration-(--linear-app-frame-seam) underline-offset-2'
                    >
                      {formatStatusLabel(target.targetType)}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className='mt-2 text-sm text-secondary-token'>
                No discovered targets yet. Tracking starts after the live page
                appears.
              </p>
            )}

            {openIssues.length > 0 && (
              <ul className='mt-3 space-y-2 text-sm text-primary-token'>
                {openIssues.map(issue => (
                  <li key={issue.id}>
                    <span className='font-medium'>
                      {formatStatusLabel(issue.field)}
                    </span>
                    {': '}
                    {formatStatusLabel(issue.issueType)}
                    {issue.observedValue ? ` (${issue.observedValue})` : ''}
                  </li>
                ))}
              </ul>
            )}
            {openIssues.length === 0 && latestRequest.status === 'live' && (
              <p className='mt-3 text-sm text-emerald-700'>
                No open drift issues on the latest snapshot.
              </p>
            )}
          </div>
        </div>
      )}
      {!latestRequest && actionState === 'loading' && (
        <p className='mt-4 text-sm text-secondary-token'>
          Loading metadata agent state...
        </p>
      )}
    </section>
  );
}
