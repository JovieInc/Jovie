'use client';

import { Fragment, useMemo } from 'react';
import { type ChatToken, parseTokens } from '@/lib/chat/tokens';
import { cn } from '@/lib/utils';
import { EntityChip, type EntityChipTone } from './EntityChip';
import { EntityChipPopover } from './EntityChipPopover';
import { useEntityResolution } from './EntityResolutionProvider';

function tokenKey(token: ChatToken, index: number): string {
  if (token.type === 'text') return `t:${index}:${token.value.length}`;
  if (token.type === 'entity') {
    return `${token.kind}:${token.id}:${index}`;
  }
  return `skill:${token.id}:${index}`;
}

interface TokenizedTextProps {
  readonly content: string;
  readonly className?: string;
  /**
   * Surface tone for entity chips. Forwarded to each `EntityChip` so chips
   * blend with the bubble background (user bubble = onLight, dark transcript
   * surfaces = onDark). Defaults to `onDark` for backwards compatibility.
   */
  readonly tone?: EntityChipTone;
}

/**
 * Renders a chat message string, replacing `@kind:id[label]` and `/skill:id`
 * tokens with inline chip/badge UI. Non-token text renders as-is with
 * `whitespace-pre-wrap` to preserve newlines.
 *
 * Used for user-authored messages in the transcript (assistant replies go
 * through ChatMarkdown, which should not show raw tokens).
 *
 * When an `EntityResolutionProvider` is mounted above, entity chips lift
 * thumbnail + meta out of the existing TanStack Query cache and render the
 * hover popover with rich preview. Outside the provider, chips degrade to
 * label + accent dot (still surface-aware via `tone`).
 */
export function TokenizedText({
  content,
  className,
  tone = 'onDark',
}: TokenizedTextProps) {
  const tokens = useMemo(() => parseTokens(content), [content]);

  if (tokens.length === 0) return null;

  // Fast path: plain text only.
  if (tokens.length === 1 && tokens[0].type === 'text') {
    return (
      <span className={cn('whitespace-pre-wrap', className)}>
        {tokens[0].value}
      </span>
    );
  }

  return (
    <span className={cn('whitespace-pre-wrap', className)}>
      {tokens.map((token, i) => {
        const key = tokenKey(token, i);
        if (token.type === 'text') {
          return <Fragment key={key}>{token.value}</Fragment>;
        }
        if (token.type === 'entity') {
          return (
            <TranscriptEntityChip
              key={key}
              kind={token.kind}
              id={token.id}
              label={token.label}
              tone={tone}
            />
          );
        }
        return (
          <span
            key={key}
            className='inline-flex items-center rounded bg-surface-2 px-1.5 py-0.5 align-baseline text-xs font-medium text-secondary-token'
            title={`Skill: ${token.id}`}
          >
            /{token.id}
          </span>
        );
      })}
    </span>
  );
}

interface TranscriptEntityChipProps {
  readonly kind: 'release' | 'artist' | 'track' | 'event';
  readonly id: string;
  readonly label: string;
  readonly tone: EntityChipTone;
}

function TranscriptEntityChip({
  kind,
  id,
  label,
  tone,
}: TranscriptEntityChipProps) {
  const { ref: resolved } = useEntityResolution(kind, id);
  return (
    <EntityChipPopover kind={kind} id={id} label={label} entity={resolved}>
      <EntityChip
        data={{
          kind,
          id,
          label,
          thumbnail: resolved?.thumbnail,
        }}
        variant='transcript'
        tone={tone}
      />
    </EntityChipPopover>
  );
}
