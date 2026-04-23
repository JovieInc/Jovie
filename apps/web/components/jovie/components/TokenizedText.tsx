'use client';

import { Fragment, useMemo } from 'react';
import { parseTokens } from '@/lib/chat/tokens';
import { cn } from '@/lib/utils';
import { EntityChip } from './EntityChip';

interface TokenizedTextProps {
  readonly content: string;
  readonly className?: string;
}

/**
 * Renders a chat message string, replacing `@kind:id[label]` and `/skill:id`
 * tokens with inline chip/badge UI. Non-token text renders as-is with
 * `whitespace-pre-wrap` to preserve newlines.
 *
 * Used for user-authored messages in the transcript (assistant replies go
 * through ChatMarkdown, which should not show raw tokens).
 */
export function TokenizedText({ content, className }: TokenizedTextProps) {
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
        const key =
          token.type === 'text'
            ? `t:${i}:${token.value.length}`
            : `${token.type === 'entity' ? token.kind : 'skill'}:${token.id}:${i}`;
        if (token.type === 'text') {
          return <Fragment key={key}>{token.value}</Fragment>;
        }
        if (token.type === 'entity') {
          return (
            <EntityChip
              key={key}
              variant='transcript'
              data={{
                kind: token.kind,
                id: token.id,
                label: token.label,
              }}
            />
          );
        }
        return (
          <span
            key={key}
            className='inline-flex items-center rounded bg-surface-2 px-1.5 py-0.5 align-baseline text-[12px] font-medium text-secondary-token'
            title={`Skill: ${token.id}`}
          >
            /{token.id}
          </span>
        );
      })}
    </span>
  );
}
