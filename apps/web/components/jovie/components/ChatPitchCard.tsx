'use client';

import { Button } from '@jovie/ui';
import { useCallback, useEffect, useState } from 'react';
import { CopyToggleIcon } from '@/components/atoms/CopyToggleIcon';
import { toast } from '@/components/feedback';
import { PLATFORM_LIMITS } from '@/lib/services/pitch/types';
import { ChatArtifactErrorCard } from './ChatArtifactErrorCard';
import { ChatGenerationArtifactSurface } from './ChatGenerationArtifactSurface';

const PLATFORM_CONFIG = [
  { key: 'spotify' as const, label: 'Spotify', limit: PLATFORM_LIMITS.spotify },
  {
    key: 'appleMusic' as const,
    label: 'Apple Music',
    limit: PLATFORM_LIMITS.appleMusic,
  },
  {
    key: 'amazon' as const,
    label: 'Amazon Music',
    limit: PLATFORM_LIMITS.amazon,
  },
  {
    key: 'generic' as const,
    label: 'General',
    limit: PLATFORM_LIMITS.generic,
  },
] as const;

interface PitchResult {
  readonly spotify: string;
  readonly appleMusic: string;
  readonly amazon: string;
  readonly generic: string;
}

interface PitchDraftResult {
  readonly destinationLabel: string;
  readonly subjectLine: string | null;
  readonly body: string;
}

interface ChatPitchCardProps {
  readonly state: 'loading' | 'success' | 'error';
  readonly releaseTitle?: string;
  readonly pitch?: PitchDraftResult;
  readonly pitches?: PitchResult;
  readonly error?: string;
}

function CopyButton({
  text,
  platform,
}: Readonly<{ text: string; platform: string }>) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        toast.success(`${platform} pitch copied`);
      })
      .catch(() => {
        toast.error('Failed to copy');
      });
  }, [text, platform]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      type='button'
      variant='ghost'
      size='icon'
      onClick={handleCopy}
      className='h-6 w-6 rounded-md focus-ring'
      aria-label={`Copy ${platform} pitch`}
    >
      <CopyToggleIcon copied={copied} size='system-b-chat-pitch-copy-icon' />
    </Button>
  );
}

function PitchBlock({
  label,
  text,
  limit,
}: Readonly<{ label: string; text: string; limit?: number }>) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 180;

  return (
    <div className='system-b-chat-pitch-block'>
      <div className='system-b-chat-pitch-block-header'>
        <span className='system-b-chat-pitch-block-label'>{label}</span>
        <div className='system-b-chat-pitch-block-meta'>
          {limit ? (
            <span
              className='system-b-chat-pitch-count'
              data-over-limit={text.length > limit ? 'true' : undefined}
            >
              {text.length}/{limit}
            </span>
          ) : null}
          <CopyButton text={text} platform={label} />
        </div>
      </div>
      <p
        className='system-b-chat-pitch-block-text'
        data-clamped={!expanded && isLong ? 'true' : undefined}
      >
        {text}
      </p>
      {isLong && (
        <button
          type='button'
          onClick={() => setExpanded(!expanded)}
          className='system-b-chat-pitch-toggle focus-ring'
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

export function ChatPitchCard({
  state,
  releaseTitle,
  pitch,
  pitches,
  error,
}: ChatPitchCardProps) {
  if (state === 'loading') {
    return (
      <ChatGenerationArtifactSurface title='Generating Pitch'>
        <div className='system-b-chat-pitch-loading'>
          <div
            aria-hidden='true'
            className='system-b-chat-generation-shimmer'
          />
          <div className='system-b-chat-pitch-loading-stack'>
            {[1, 2, 3, 4].map(i => (
              <div key={i} className='system-b-chat-pitch-loading-card'>
                <div className='system-b-chat-pitch-loading-title' />
                <div className='system-b-chat-pitch-loading-lines'>
                  <div className='system-b-chat-pitch-loading-line' />
                  <div className='system-b-chat-pitch-loading-line-short' />
                </div>
              </div>
            ))}
          </div>
        </div>
      </ChatGenerationArtifactSurface>
    );
  }

  if (state === 'error') {
    return (
      <ChatArtifactErrorCard
        title='Pitch Generation Failed'
        message={error}
        retryPrompt='Please retry generating the pitch.'
      />
    );
  }

  if (pitch) {
    const copyText = pitch.subjectLine
      ? `Subject: ${pitch.subjectLine}\n\n${pitch.body}`
      : pitch.body;

    return (
      <ChatGenerationArtifactSurface
        title='Generated Pitch'
        subtitle={
          releaseTitle
            ? `${releaseTitle} · ${pitch.destinationLabel}`
            : pitch.destinationLabel
        }
      >
        <div className='system-b-chat-pitch-stack'>
          {pitch.subjectLine ? (
            <PitchBlock label='Subject' text={pitch.subjectLine} limit={120} />
          ) : null}
          <PitchBlock label='Pitch' text={pitch.body} />
          <div className='system-b-chat-pitch-full-draft-row'>
            <span className='system-b-chat-pitch-full-draft-label'>
              Full draft
            </span>
            <CopyButton text={copyText} platform='Pitch' />
          </div>
        </div>
      </ChatGenerationArtifactSurface>
    );
  }

  if (!pitches) return null;

  return (
    <ChatGenerationArtifactSurface
      title='Generated Pitches'
      subtitle={releaseTitle ?? null}
    >
      <div className='system-b-chat-pitch-stack'>
        {PLATFORM_CONFIG.map(({ key, label, limit }) => {
          const text = pitches[key];
          if (!text) return null;
          return (
            <PitchBlock key={key} label={label} text={text} limit={limit} />
          );
        })}
      </div>
    </ChatGenerationArtifactSurface>
  );
}
