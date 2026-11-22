'use client';

import { Button, HostDrawnInput } from '@jovie/ui';
import { AlertCircle, Check, Link2, Loader2 } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import {
  ATTACH_ACCOUNT_CTA_LABEL,
  HANDLE_ACCEPT_COPY,
} from '@/lib/chat/onboarding-script/widget-events';
import {
  SUGGESTED_AVAILABLE_HANDLE_LABEL,
  toHandleAvailabilityResult,
} from '@/lib/onboarding/handle-availability';
import { parseSocialLinkInput } from '@/lib/onboarding/social-link-parse';
import { hostnameFor } from '@/lib/onboarding/tool-artifact-format';
import { useHandleAvailabilityQuery } from '@/lib/queries/useHandleAvailabilityQuery';
import { cn } from '@/lib/utils';
import { OnboardingToolField } from './OnboardingToolField';
import {
  type HandleCheckOutput,
  isFailed,
  isRunning,
  type SocialLinkOutput,
  type ToolArtifactProps,
} from './onboardingToolArtifactTypes';

export function StatusShell({
  icon,
  title,
  body,
  tone = 'neutral',
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly body?: string;
  readonly tone?: 'neutral' | 'success' | 'error';
}) {
  return (
    <div
      className={cn(
        'w-full max-w-md px-1 py-2 text-primary-token',
        tone === 'error' && 'text-error'
      )}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <div className='flex items-start gap-3'>
        <span
          className={cn(
            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-secondary-token',
            tone === 'error' && 'text-error',
            tone === 'success' && 'text-success'
          )}
        >
          {icon}
        </span>
        <div className='min-w-0'>
          <p className='text-sm font-semibold leading-5 tracking-tight'>
            {title}
          </p>
          {body ? (
            <p className='mt-1 text-xs leading-5 text-secondary-token'>
              {body}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function OnboardingHandleCheckCard({
  onHandleCandidateChange,
  onConfirmHandle,
  state,
  output,
  disabled = false,
}: ToolArtifactProps & {
  readonly onHandleCandidateChange?: (handle: string | null) => void;
  readonly onConfirmHandle?: (handle: string) => void;
  readonly output?: HandleCheckOutput | null;
  readonly disabled?: boolean;
}) {
  const handle = output?.handle?.replace(/^@/, '').toLowerCase() ?? null;
  const fieldId = useId();
  const [draftHandle, setDraftHandle] = useState(handle ?? '');
  const [confirmed, setConfirmed] = useState(false);
  const [editing, setEditing] = useState(false);
  const handleInputRef = useRef<HTMLInputElement>(null);
  // Change Handle moves focus into the field it just opened.
  useEffect(() => {
    if (editing) handleInputRef.current?.focus();
  }, [editing]);
  const outputConfirmed = output?.action === 'handle_confirmed';
  const normalizedDraft = draftHandle.replace(/^@/, '').trim().toLowerCase();
  const availabilityQuery = useHandleAvailabilityQuery({
    handle: normalizedDraft || null,
    enabled:
      Boolean(normalizedDraft) &&
      !isRunning(state) &&
      !isFailed(state) &&
      !outputConfirmed,
  });

  useEffect(() => {
    setDraftHandle(handle ?? '');
  }, [handle]);

  useEffect(() => {
    onHandleCandidateChange?.(normalizedDraft);
  }, [normalizedDraft, onHandleCandidateChange]);

  if (isFailed(state)) {
    return (
      <StatusShell
        icon={<AlertCircle className='h-3.5 w-3.5' />}
        title='Handle check failed'
        body='Send another handle and I will check it.'
        tone='error'
      />
    );
  }

  if (isRunning(state) || !handle) {
    return (
      <StatusShell
        icon={
          <Loader2 className='h-3.5 w-3.5 animate-spin motion-reduce:animate-none' />
        }
        title='Checking the handle'
        body={handle ? `@${handle}` : undefined}
      />
    );
  }

  if (outputConfirmed) {
    return (
      <StatusShell
        icon={<Check className='h-3.5 w-3.5' />}
        title='Handle confirmed'
        body={`@${handle}`}
        tone='success'
      />
    );
  }

  const loading = availabilityQuery.isLoading || availabilityQuery.isFetching;
  const availability = toHandleAvailabilityResult({
    handle: normalizedDraft || handle || '',
    available: loading ? null : (availabilityQuery.data?.available ?? null),
    error: availabilityQuery.data?.error,
    suggestedAlternatives: availabilityQuery.data?.suggestedAlternatives,
    checking: loading,
  });
  const available =
    availability.reason === 'checking' || availability.reason === 'unknown'
      ? undefined
      : availability.available;
  const error = availability.error;
  const profilePath = `jov.ie/${normalizedDraft || handle}`;
  const canConfirm =
    Boolean(normalizedDraft) &&
    available === true &&
    !loading &&
    !disabled &&
    !confirmed;
  // Pen R6As7U: one line and one action. Editing stays reachable but
  // secondary, behind an explicit Change Handle.
  const showEditor = editing;
  const isTaken = available === false;
  const statusLabel =
    loading || available === undefined
      ? 'is being checked'
      : available
        ? 'is available'
        : 'is taken';
  const helper =
    error ??
    (available === false
      ? availability.suggestedAlternatives &&
        availability.suggestedAlternatives.length > 0
        ? `${SUGGESTED_AVAILABLE_HANDLE_LABEL}: @${availability.suggestedAlternatives[0]}`
        : 'Try a sharper variant.'
      : null);

  return (
    <div
      className={cn(
        'w-full max-w-md py-1 text-primary-token',
        available === false && 'text-error'
      )}
      data-testid='onboarding-handle-check'
      data-editing={showEditor ? 'true' : 'false'}
      role={available === false ? 'alert' : 'status'}
    >
      <div
        className='flex items-center gap-1.5 text-sm leading-5 tracking-tight'
        data-testid='onboarding-handle-status'
      >
        <span
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center text-secondary-token',
            available && 'text-success',
            available === false && 'text-error'
          )}
          aria-hidden
        >
          {loading ? (
            <Loader2 className='h-3.5 w-3.5 animate-spin motion-reduce:animate-none' />
          ) : available ? (
            <Check className='h-3.5 w-3.5' />
          ) : (
            <AlertCircle className='h-3.5 w-3.5' />
          )}
        </span>
        <strong className='font-semibold text-primary-token'>
          {profilePath}
        </strong>
        <span className='text-secondary-token'>{statusLabel}</span>
      </div>
      {helper && !showEditor ? (
        <p className='mt-1.5 text-xs leading-5 text-secondary-token'>
          {helper}
        </p>
      ) : null}
      {showEditor ? (
        <>
          <OnboardingToolField density='compact' htmlFor={fieldId}>
            <span className='text-app text-tertiary-token' aria-hidden>
              jov.ie/
            </span>
            <span className='sr-only'>Edit Proposed Handle</span>
            <HostDrawnInput
              id={fieldId}
              aria-label='Edit Proposed Handle'
              value={draftHandle}
              onChange={event => setDraftHandle(event.target.value)}
              className='min-w-0 flex-1'
              placeholder='Handle'
              inputMode='text'
              autoCapitalize='none'
              spellCheck={false}
              disabled={disabled || confirmed}
              ref={handleInputRef}
            />
          </OnboardingToolField>
          {helper ? (
            <p className='mt-1.5 text-xs leading-5 text-secondary-token'>
              {helper}
            </p>
          ) : null}
        </>
      ) : null}
      {onConfirmHandle || !(showEditor || confirmed) ? (
        <div className='mt-3 flex items-center gap-2'>
          {isTaken || !onConfirmHandle ? null : (
            <Button
              type='button'
              data-testid='onboarding-confirm-handle'
              disabled={!canConfirm}
              onClick={() => {
                if (!canConfirm || !normalizedDraft) return;
                setConfirmed(true);
                onConfirmHandle(normalizedDraft);
              }}
            >
              {confirmed ? 'Kept' : HANDLE_ACCEPT_COPY}
            </Button>
          )}
          {showEditor || confirmed ? null : (
            <Button
              type='button'
              variant={isTaken ? 'primary' : 'ghost'}
              size='sm'
              data-testid='onboarding-edit-handle'
              disabled={disabled}
              onClick={() => setEditing(true)}
            >
              Change Handle
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function OnboardingSocialLinkCard({
  state,
  output,
  onAttachAccount,
  disabled = false,
}: ToolArtifactProps & {
  readonly output?: SocialLinkOutput | null;
  readonly onAttachAccount?: (url: string) => void;
  readonly disabled?: boolean;
}) {
  const initialUrl = output?.url ?? '';
  const fieldId = useId();
  const [draftUrl, setDraftUrl] = useState(initialUrl);
  const [attached, setAttached] = useState(false);

  useEffect(() => {
    if (initialUrl) setDraftUrl(initialUrl);
  }, [initialUrl]);

  if (isFailed(state)) {
    return (
      <StatusShell
        icon={<AlertCircle className='h-3.5 w-3.5' />}
        title='Link could not be prepared'
        body='Send the full URL again and I will retry it.'
        tone='error'
      />
    );
  }

  if (isRunning(state) && !output) {
    return (
      <StatusShell
        icon={
          <Loader2 className='h-3.5 w-3.5 animate-spin motion-reduce:animate-none' />
        }
        title='Reading the link'
      />
    );
  }

  if (output?.action === 'social_attached') {
    return (
      <StatusShell
        icon={<Check className='h-3.5 w-3.5' />}
        title='Social account attached'
        body={hostnameFor(output.url ?? undefined) ?? undefined}
        tone='success'
      />
    );
  }

  const trimmed = draftUrl.trim();
  const parsed = parseSocialLinkInput(trimmed);
  const attachableUrl = parsed.ok ? parsed.url : null;
  const host = attachableUrl
    ? hostnameFor(attachableUrl)
    : hostnameFor(trimmed || undefined);
  const parseHint =
    !trimmed || parsed.ok
      ? null
      : parsed.reason === 'missing_account_path'
        ? 'Add the account path (e.g. instagram.com/yourname).'
        : 'Paste a full profile URL with the account path.';
  const canAttach =
    Boolean(attachableUrl) &&
    !disabled &&
    !attached &&
    Boolean(onAttachAccount);

  return (
    <div
      className='w-full max-w-md px-1 py-2 text-primary-token'
      data-testid='onboarding-social-link'
      role='status'
    >
      <div className='flex items-start gap-3'>
        <span
          className='mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-secondary-token'
          aria-hidden
        >
          <Link2 className='h-3.5 w-3.5' />
        </span>
        <div className='min-w-0 flex-1'>
          <p className='text-sm font-semibold leading-5 tracking-tight text-primary-token'>
            {attachableUrl
              ? 'Link ready to attach'
              : 'Attach a public social account'}
          </p>
          <OnboardingToolField density='compact' htmlFor={fieldId}>
            <span className='sr-only'>Social Profile URL</span>
            <HostDrawnInput
              id={fieldId}
              aria-label='Social Profile URL'
              value={draftUrl}
              onChange={event => setDraftUrl(event.target.value)}
              className='min-w-0 flex-1'
              placeholder='https://instagram.com/yourname'
              inputMode='url'
              autoCapitalize='none'
              spellCheck={false}
              disabled={disabled || attached}
            />
          </OnboardingToolField>
          <p className='mt-1.5 text-xs leading-5 text-secondary-token'>
            {parseHint ??
              host ??
              'Paste the full profile URL, like instagram.com/yourname.'}
          </p>
          {onAttachAccount ? (
            <Button
              type='button'
              data-testid='onboarding-attach-account'
              disabled={!canAttach}
              onClick={() => {
                if (!canAttach || !attachableUrl) return;
                setAttached(true);
                onAttachAccount(attachableUrl);
              }}
              className='mt-3'
            >
              {attached ? 'Account Attached' : ATTACH_ACCOUNT_CTA_LABEL}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
