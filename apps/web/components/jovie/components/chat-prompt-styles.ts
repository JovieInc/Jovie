export const CHAT_PROMPT_RAIL_SCROLL_CLASS =
  'w-full overflow-x-auto overflow-y-hidden scroll-smooth pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

export const CHAT_PROMPT_RAIL_CLASS = 'flex min-w-full items-stretch gap-2.5';

export const CHAT_PROMPT_RAIL_MASK_STYLE = {
  WebkitMaskImage:
    'linear-gradient(to right, transparent 0, black 18px, black calc(100% - 18px), transparent 100%)',
  maskImage:
    'linear-gradient(to right, transparent 0, black 18px, black calc(100% - 18px), transparent 100%)',
} as const;

const CHAT_PROMPT_PILL_BASE_CLASS =
  'group inline-flex items-center gap-2.5 rounded-full border border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_96%,var(--linear-bg-surface-0))] text-left text-secondary-token transition-[background-color,border-color,color,box-shadow,transform] duration-150 hover:border-default hover:bg-surface-0 hover:text-primary-token hover:shadow-[var(--linear-app-card-shadow)] focus-visible:outline-none focus-visible:border-(--linear-border-focus) focus-visible:bg-surface-0 focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/16 active:translate-y-px active:bg-surface-1';

const CHAT_PROMPT_PILL_DEFAULT_CLASS =
  'min-w-[220px] max-w-[320px] px-3.5 py-2.5 text-[13px]';

const CHAT_PROMPT_PILL_COMPACT_CLASS =
  'min-w-[170px] max-w-[240px] px-3 py-1.5 text-[12px]';

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
