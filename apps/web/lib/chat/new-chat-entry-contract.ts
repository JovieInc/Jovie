export const CHAT_HOME_HEADING = 'Just ask' as const;
export const CHAT_STARTER_CONVERSATION_STORAGE_KEY =
  'jovie.chat-starter-conversation-index';

export type ChatStarterConversationId =
  | 'prioritize-next'
  | 'shape-plan'
  | 'compare-signals';

export interface ChatStarterConversation {
  readonly id: ChatStarterConversationId;
  readonly userPrompt: string;
  readonly assistantReply: string;
  readonly executable: true;
  readonly telemetryKey: string;
}

export const CHAT_STARTER_CONVERSATIONS = [
  {
    id: 'prioritize-next',
    userPrompt: 'What should I work on next?',
    assistantReply:
      'I’ll rank the highest-impact moves and start with the first.',
    executable: true,
    telemetryKey: 'prioritize_next',
  },
  {
    id: 'shape-plan',
    userPrompt: 'Turn this idea into a plan.',
    assistantReply: 'I’ll turn it into clear steps, owners, and a finish line.',
    executable: true,
    telemetryKey: 'shape_plan',
  },
  {
    id: 'compare-signals',
    userPrompt: 'What’s working best right now?',
    assistantReply:
      'I’ll compare the signals, explain why, and suggest the next test.',
    executable: true,
    telemetryKey: 'compare_signals',
  },
] as const satisfies readonly ChatStarterConversation[];
const FORBIDDEN_SHARED_PERSONA_PATTERN =
  /\b(?:artist|artists|band|bands|creator|creators|dj|djs|musician|musicians)\b/i;

export type ChatStarterConversationViolation =
  | 'not-executable'
  | 'missing-user-prompt'
  | 'missing-assistant-reply'
  | 'persona-specific-copy'
  | 'launch-prompt-mismatch';

export function validateChatStarterConversation({
  sample,
  launchedPrompt = sample.userPrompt,
}: {
  readonly sample: Omit<ChatStarterConversation, 'executable'> & {
    readonly executable: boolean;
  };
  readonly launchedPrompt?: string;
}): readonly ChatStarterConversationViolation[] {
  const violations: ChatStarterConversationViolation[] = [];
  const visiblePrompt = sample.userPrompt.trim();
  const assistantReply = sample.assistantReply.trim();

  if (!sample.executable) violations.push('not-executable');
  if (!visiblePrompt) violations.push('missing-user-prompt');
  if (!assistantReply) violations.push('missing-assistant-reply');
  if (
    FORBIDDEN_SHARED_PERSONA_PATTERN.test(visiblePrompt) ||
    FORBIDDEN_SHARED_PERSONA_PATTERN.test(assistantReply)
  ) {
    violations.push('persona-specific-copy');
  }
  if (launchedPrompt !== sample.userPrompt) {
    violations.push('launch-prompt-mismatch');
  }

  return violations;
}

export function starterConversationAtIndex(
  index: number
): ChatStarterConversation {
  const count = CHAT_STARTER_CONVERSATIONS.length;
  const safe = ((index % count) + count) % count;
  return CHAT_STARTER_CONVERSATIONS[safe];
}

function readSessionStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

export function takeNextStarterConversationIndex(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = readSessionStorage()
): number {
  if (!storage) return 0;

  try {
    const raw = storage.getItem(CHAT_STARTER_CONVERSATION_STORAGE_KEY);
    const parsed = raw == null ? 0 : Number.parseInt(raw, 10);
    const index = Number.isFinite(parsed) ? parsed : 0;
    const safeIndex =
      ((index % CHAT_STARTER_CONVERSATIONS.length) +
        CHAT_STARTER_CONVERSATIONS.length) %
      CHAT_STARTER_CONVERSATIONS.length;
    storage.setItem(
      CHAT_STARTER_CONVERSATION_STORAGE_KEY,
      String(safeIndex + 1)
    );
    return safeIndex;
  } catch {
    return 0;
  }
}
