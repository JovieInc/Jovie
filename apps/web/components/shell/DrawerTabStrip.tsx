'use client';

import { cn } from '@/lib/utils';

export interface DrawerTab<T extends string = string> {
  readonly value: T;
  readonly label: string;
}

export interface DrawerTabStripProps<T extends string> {
  readonly tabs: readonly DrawerTab<T>[];
  readonly active: T;
  readonly onChange: (value: T) => void;
  readonly className?: string;
  /** Override the default `aria-label` on the underlying tablist. */
  readonly ariaLabel?: string;
}

/**
 * DrawerTabStrip — segmented-control style tab strip used at the top of
 * an entity drawer body. Tabs share the strip equally (`flex-1`) so the
 * row reads as a proper segmented control. The active tab carries a
 * brighter surface and a subtle inner ring for unmistakable selected
 * state. The component is generic over the tab value union so callers
 * keep the closed enum of allowed tabs at their own call site:
 *
 * ```tsx
 * type ReleaseDrawerTab = 'overview' | 'distribution' | 'activity';
 *
 * <DrawerTabStrip<ReleaseDrawerTab>
 *   tabs={[
 *     { value: 'overview', label: 'Overview' },
 *     { value: 'distribution', label: 'Distribution' },
 *     { value: 'activity', label: 'Activity' },
 *   ]}
 *   active={tab}
 *   onChange={setTab}
 * />
 * ```
 */
export function DrawerTabStrip<T extends string>({
  tabs,
  active,
  onChange,
  className,
  ariaLabel = 'Drawer sections',
}: DrawerTabStripProps<T>) {
  return (
    <div className={cn('shrink-0 px-2 pt-2 pb-2', className)}>
      <div
        role='tablist'
        aria-label={ariaLabel}
        className='flex items-center gap-0.5 p-0.5 rounded-full bg-(--surface-0)/70 border border-(--linear-app-shell-border)/70'
      >
        {tabs.map(t => {
          const on = active === t.value;
          return (
            <button
              key={t.value}
              type='button'
              role='tab'
              aria-selected={on}
              onClick={() => onChange(t.value)}
              className={cn(
                'flex-1 h-7 px-3 rounded-full text-[11.5px] font-medium tracking-[-0.005em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token transition-colors duration-150 ease-out',
                on
                  ? 'bg-(--surface-2) text-primary-token ring-1 ring-inset ring-white/10 shadow-[0_1px_0_0_rgba(255,255,255,0.05)]'
                  : 'text-tertiary-token hover:text-primary-token'
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
