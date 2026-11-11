'use client';

import dynamic from 'next/dynamic';
import { ChatLoadingBody } from './ChatLoadingState';

/**
 * JovieChat in its own chunk (JOV-10150). A cold /app/chat load used to
 * evaluate the chat bundle (the AI SDK, tool-event schemas, message rendering)
 * and hydrate it inside the shell's one blocking hydration task, the long
 * frame the production cert flags. Behind next/dynamic the server still
 * renders it, and the client evaluates and hydrates it in a later task. The
 * skeleton only shows on a client navigation that beats the chunk.
 */
export const JovieChat = dynamic(
  () => import('@/components/jovie/JovieChat').then(module => module.JovieChat),
  { loading: () => <ChatLoadingBody /> }
);
