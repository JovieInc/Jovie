'use client';

import { useMemo } from 'react';
import { type ChatToken, parseTokens } from '@/lib/chat/tokens';
import { skillById } from '@/lib/commands/registry';
import { ChatMarkdown } from './ChatMarkdown';
import { EntityChipPopover } from './EntityChipPopover';
import { EntityMentionSpan } from './EntityMentionSpan';
import { useEntityResolution } from './EntityResolutionProvider';

function tokenKey(token: ChatToken, index: number): string {
  if (token.type === 'text') return `t:${index}:${token.value.length}`;
  if (token.type === 'entity') {
    return `${token.kind}:${token.id}:${index}`;
  }
  return `skill:${token.id}:${index}`;
}

interface AssistantMessageTextProps {
  readonly content: string;
  readonly isStreaming?: boolean;
}

/**
 * Renders assistant reply text with progressive-disclosure entity spans.
 * Wire tokens become subdued accent underlines; hover opens the detail card.
 * Plain markdown segments still flow through `ChatMarkdown`.
 */
export function AssistantMessageText({
  content,
  isStreaming = false,
}: AssistantMessageTextProps) {
  const tokens = useMemo(() => parseTokens(content), [content]);

  if (tokens.length === 1 && tokens[0]?.type === 'text') {
    return <ChatMarkdown content={content} isStreaming={isStreaming} />;
  }

  return (
    <>
      {tokens.map((token, index) => {
        const key = tokenKey(token, index);
        if (token.type === 'text') {
          return (
            <ChatMarkdown
              key={key}
              content={token.value}
              isStreaming={isStreaming}
            />
          );
        }
        if (token.type === 'entity') {
          return (
            <AssistantEntityMention
              key={key}
              kind={token.kind}
              id={token.id}
              label={token.label}
            />
          );
        }
        return <AssistantSkillMention key={key} id={token.id} />;
      })}
    </>
  );
}

interface AssistantEntityMentionProps {
  readonly kind: 'release' | 'artist' | 'track' | 'event';
  readonly id: string;
  readonly label: string;
}

function AssistantEntityMention({
  kind,
  id,
  label,
}: AssistantEntityMentionProps) {
  const { ref: resolved } = useEntityResolution(kind, id);

  return (
    <EntityChipPopover kind={kind} id={id} label={label} entity={resolved}>
      <EntityMentionSpan kind={kind} label={label} />
    </EntityChipPopover>
  );
}

function AssistantSkillMention({ id }: { readonly id: string }) {
  const label = skillById(id)?.label ?? id;
  return (
    <span
      className='system-b-assistant-skill-mention'
      data-testid='assistant-skill-mention'
    >
      {label}
    </span>
  );
}
