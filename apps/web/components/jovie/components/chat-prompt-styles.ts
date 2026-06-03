export const CHAT_PROMPT_RAIL_SCROLL_CLASS = 'system-b-chat-prompt-rail-scroll';

export const CHAT_PROMPT_RAIL_CLASS = 'system-b-chat-prompt-rail';

const CHAT_PROMPT_PILL_BASE_CLASS = 'group system-b-chat-prompt-pill';

const CHAT_PROMPT_PILL_DEFAULT_CLASS = 'system-b-chat-prompt-pill-default';

const CHAT_PROMPT_PILL_COMPACT_CLASS = 'system-b-chat-prompt-pill-compact';

export function getChatPromptPillClass(
  density: 'default' | 'compact' = 'default'
) {
  return [
    CHAT_PROMPT_PILL_BASE_CLASS,
    density === 'compact'
      ? CHAT_PROMPT_PILL_COMPACT_CLASS
      : CHAT_PROMPT_PILL_DEFAULT_CLASS,
  ].join(' ');
}
