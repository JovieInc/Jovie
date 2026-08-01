'use client';

import { Button } from '@jovie/ui';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { CopyToggleIcon } from '@/components/atoms/CopyToggleIcon';
import { toast } from '@/components/feedback';
import { ChatArtifactErrorCard } from './ChatArtifactErrorCard';
import { ChatGenerationArtifactSurface } from './ChatGenerationArtifactSurface';

export interface PresenceArtifactFact {
  readonly label: string;
  readonly value: string;
}

export interface ChatPresenceArtifactCardProps {
  readonly state: 'loading' | 'success' | 'error';
  readonly title?: string;
  readonly summary?: string;
  readonly facts?: readonly PresenceArtifactFact[];
  readonly href?: string;
  readonly draftText?: string;
  readonly empty?: boolean;
  readonly error?: string;
}

function CopyDraftButton({ text }: Readonly<{ text: string }>) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        toast.success('Draft copied');
      })
      .catch(() => {
        toast.error('Failed to copy');
      });
  }, [text]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      type='button'
      variant='secondary'
      size='sm'
      onClick={handleCopy}
      aria-label={copied ? 'Draft copied' : 'Copy draft'}
    >
      <CopyToggleIcon copied={copied} className='size-3.5' />
      {copied ? 'Copied' : 'Copy Draft'}
    </Button>
  );
}

export function ChatPresenceArtifactCard({
  state,
  title = 'Presence task',
  summary,
  facts = [],
  href,
  draftText,
  empty = false,
  error,
}: ChatPresenceArtifactCardProps) {
  if (state === 'loading') {
    return (
      <ChatGenerationArtifactSurface
        title={title}
        subtitle='Working with data already on your profile…'
      >
        <div
          className='flex min-h-16 items-center gap-2 text-sm text-secondary-token'
          data-testid='chat-presence-artifact-loading'
        >
          <Loader2 className='size-4 animate-spin' aria-hidden />
          <span>Running…</span>
        </div>
      </ChatGenerationArtifactSurface>
    );
  }

  if (state === 'error') {
    return (
      <ChatArtifactErrorCard
        title={`${title} failed`}
        message={error ?? 'Something went wrong while building this artifact.'}
        showRetry={false}
      />
    );
  }

  return (
    <ChatGenerationArtifactSurface title={title} subtitle={summary ?? null}>
      <div
        className='flex min-h-16 flex-col gap-3'
        data-testid='chat-presence-artifact-success'
      >
        {empty && facts.length === 0 ? (
          <p className='text-sm text-secondary-token'>
            Nothing verified yet — connect sources to fill this in.
          </p>
        ) : null}
        {facts.length > 0 ? (
          <dl className='grid gap-2'>
            {facts.map(fact => (
              <div
                key={`${fact.label}:${fact.value}`}
                className='flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3'
              >
                <dt className='shrink-0 text-xs font-medium text-secondary-token'>
                  {fact.label}
                </dt>
                <dd className='min-w-0 break-words text-sm text-primary-token'>
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {draftText ? (
          <div className='rounded-md bg-surface-0 p-3 text-sm text-primary-token'>
            <p className='whitespace-pre-wrap'>{draftText}</p>
          </div>
        ) : null}
        <div className='flex flex-wrap items-center gap-2'>
          {draftText ? <CopyDraftButton text={draftText} /> : null}
          {href ? (
            <Button asChild variant='secondary' size='sm'>
              <a href={href} target='_blank' rel='noopener noreferrer'>
                <ExternalLink className='size-3.5' aria-hidden />
                Open Link
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </ChatGenerationArtifactSurface>
  );
}
