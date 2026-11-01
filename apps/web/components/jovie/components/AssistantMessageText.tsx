'use client';

import { lazy, memo, Suspense, useMemo } from 'react';
import { type ChatToken, parseTokens } from '@/lib/chat/tokens';
import { skillById } from '@/lib/commands/registry';
import { EntityChipPopover } from './EntityChipPopover';
import { EntityMentionSpan } from './EntityMentionSpan';
import { useEntityResolution } from './EntityResolutionProvider';

/**
 * The markdown engine (streamdown + remark) is ~460 KB decoded and is not
 * needed to paint an empty chat, so it is a separate chunk. It is requested
 * once the main thread is idle after load, so the first assistant reply
 * normally finds it cached; until then the plain text shows in the same box.
 */
const loadChatMarkdown = () =>
  import('./ChatMarkdown').then(module => ({ default: module.ChatMarkdown }));
const LazyChatMarkdown = lazy(loadChatMarkdown);

if (typeof window !== 'undefined') {
  const idle = (
    window as Window & {
      requestIdleCallback?: (callback: () => void) => number;
    }
  ).requestIdleCallback;
  const warm = () => void loadChatMarkdown();
  if (idle) idle(warm);
  else window.setTimeout(warm, 2000);
}

const ChatMarkdown = memo(function ChatMarkdown(props: {
  readonly content: string;
  readonly isStreaming?: boolean;
  readonly inline?: boolean;
}) {
  return (
    <Suspense
      fallback={<span className='whitespace-pre-wrap'>{props.content}</span>}
    >
      <LazyChatMarkdown {...props} />
    </Suspense>
  );
});

function tokenKey(token: ChatToken, index: number): string {
  if (token.type === 'text') return `t:${index}:${token.value.length}`;
  if (token.type === 'entity') {
    return `${token.kind}:${token.id}:${index}`;
  }
  return `skill:${token.id}:${index}`;
}

/**
 * Preserve Streamdown's block rendering for structured markdown. Plain prose
 * adjacent to an entity token is safe to render inline, which keeps the whole
 * sentence on one text flow instead of creating detached paragraph blocks.
 */
function isInlineMarkdownFragment(content: string): boolean {
  return (
    !/[\r\n]/.test(content) &&
    !/^\s*(?:[-*+] |\d+[.)] |#{1,6}\s|>|```)/.test(content)
  );
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
              inline={isInlineMarkdownFragment(token.value)}
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
  label: tokenLabel,
}: AssistantEntityMentionProps) {
  const { ref: resolved } = useEntityResolution(kind, id);
  // JOV-INV-046 fallback treatment: the mention's own wire label is real
  // message content, so an unresolved lookup falls back to it instead of
  // explaining the miss.
  const label = resolved?.label ?? tokenLabel;

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
