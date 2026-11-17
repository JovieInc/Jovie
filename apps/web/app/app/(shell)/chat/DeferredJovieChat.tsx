'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import type { JovieChatProps } from '@/components/jovie/types';
import { ChatLoadingBody } from './ChatLoadingState';

type MountReportingProps = JovieChatProps & { readonly onMount: () => void };

/**
 * JovieChat in its own chunk (JOV-10150). A cold /app/chat load used to
 * evaluate the chat bundle (the AI SDK, tool-event schemas, message rendering)
 * and hydrate it inside the shell's one blocking hydration task, the long
 * frame the production cert flags. Behind next/dynamic the server still
 * renders it, and the client evaluates and hydrates it in a later task. The
 * skeleton only shows on a client navigation that beats the chunk.
 */
const LazyJovieChat = dynamic<MountReportingProps>(
  () =>
    import('@/components/jovie/JovieChat').then(({ JovieChat: Chat }) => {
      function MountReportingJovieChat({
        onMount,
        ...props
      }: MountReportingProps) {
        useEffect(onMount, [onMount]);
        return <Chat {...props} />;
      }
      return MountReportingJovieChat;
    }),
  { loading: () => <ChatLoadingBody /> }
);

/**
 * Holds a value from the first render until `markMounted` runs. The page clears
 * `?q=` after its own first commit, which can land before the chunk mounts, and
 * the deferred chat still has to see the query to auto-submit it once.
 */
export function useHeldUntilMounted<T>(value: T | null | undefined) {
  const [mounted, setMounted] = useState(false);
  const [held, setHeld] = useState(value);
  if (!mounted && value && value !== held) setHeld(value);
  const markMounted = useCallback(() => setMounted(true), []);
  return [mounted ? value : value || held, markMounted] as const;
}

export function JovieChat(props: JovieChatProps) {
  const [initialQuery, markMounted] = useHeldUntilMounted(props.initialQuery);
  return (
    <LazyJovieChat
      {...props}
      initialQuery={initialQuery ?? undefined}
      onMount={markMounted}
    />
  );
}
