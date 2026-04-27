export const CHAT_PROMPT_RAIL_SCROLL_CLASS =
  'w-full overflow-x-auto overflow-y-hidden scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

export const CHAT_PROMPT_RAIL_CLASS = 'flex min-w-full items-stretch gap-1.5';

export const CHAT_PROMPT_RAIL_MASK_STYLE = {
  WebkitMaskImage:
    'linear-gradient(to right, transparent 0, black 18px, black calc(100% - 18px), transparent 100%)',
  maskImage:
    'linear-gradient(to right, transparent 0, black 18px, black calc(100% - 18px), transparent 100%)',
} as const;

const CHAT_PROMPT_PILL_BASE_CLASS =
  'group inline-flex items-center gap-2 rounded-full border border-black/6 bg-[color-mix(in_oklab,var(--linear-app-content-surface)_99%,var(--linear-bg-surface-0))] text-left text-secondary-token shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[background-color,border-color,color] duration-150 hover:border-black/10 hover:bg-surface-0 hover:text-primary-token focus-visible:outline-none focus-visible:border-(--linear-border-focus) focus-visible:bg-surface-0 focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/12 active:bg-surface-1 dark:border-white/[0.07] dark:shadow-[0_1px_2px_rgba(0,0,0,0.14)] dark:hover:border-white/[0.10]';

const CHAT_PROMPT_PILL_DEFAULT_CLASS =
  'min-w-[168px] max-w-[228px] px-3 py-1.5 text-xs';

const CHAT_PROMPT_PILL_COMPACT_CLASS =
  'min-w-[136px] max-w-[188px] px-2.5 py-1 text-2xs';

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
