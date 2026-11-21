'use client';

import { Button, HostDrawnInput } from '@jovie/ui';
import { AlertCircle, Check, Link2, Loader2 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { ATTACH_ACCOUNT_CTA_LABEL } from '@/lib/chat/onboarding-script/widget-events';
import { parseSocialLinkInput } from '@/lib/onboarding/social-link-parse';
import { hostnameFor } from '@/lib/onboarding/tool-artifact-format';
import { OnboardingToolField } from './OnboardingToolField';
import { StatusShell } from './OnboardingToolStatusShell';
import {
  isFailed,
  isRunning,
  type SocialLinkOutput,
  type ToolArtifactProps,
} from './onboardingToolArtifactTypes';

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
