'use client';

import { Fragment, useMemo } from 'react';
import { type ChatToken, parseTokens } from '@/lib/chat/tokens';
import { skillById } from '@/lib/commands/registry';
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
        return <TranscriptSkillChip key={key} id={token.id} tone={tone} />;
      })}
    </span>
  );
}

interface TranscriptSkillChipProps {
  readonly id: string;
  readonly tone: EntityChipTone;
}

function TranscriptSkillChip({ id, tone }: TranscriptSkillChipProps) {
  const label = skillById(id)?.label ?? id;
  return (
    <span
      className={cn(
        'mx-0.5 inline-flex h-6 max-w-[220px] items-center gap-1.5 rounded-[8px] border px-2 align-[-0.2em] text-[12px] font-medium leading-none shadow-none',
        tone === 'onLight'
          ? 'border-black/10 bg-black/[0.055] text-[#111216]'
          : 'border-white/[0.085] bg-white/[0.035] text-primary-token'
      )}
      title={label}
      data-testid='transcript-skill-chip'
    >
      <span
        aria-hidden
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          tone === 'onLight' ? 'bg-black/45' : 'bg-tertiary-token'
        )}
      />
      <span className='min-w-0 truncate'>{label}</span>
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
