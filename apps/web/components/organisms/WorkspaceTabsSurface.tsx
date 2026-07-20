'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback, useMemo } from 'react';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  TAB_BAR_RAIL_CLASSNAME,
  TAB_BAR_SEGMENT_TRIGGER_ACTIVE_CLASSNAME,
  TAB_BAR_SEGMENT_TRIGGER_CLASSNAME,
} from '@/components/molecules/tab-bar/TabBar';
import { cn } from '@/lib/utils';

export interface WorkspaceTabOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

const PRIMARY_TAB_RESET_KEYS = ['page', 'pageSize', 'q', 'sort'] as const;

interface WorkspaceTabsSurfaceProps<
  TPrimary extends string,
  TSecondary extends string = never,
> {
  readonly title: string;
  readonly description: string;
  readonly primaryParam: string;
  readonly primaryValue: TPrimary;
  readonly primaryOptions: readonly WorkspaceTabOption<TPrimary>[];
  readonly secondaryParam?: string;
  readonly secondaryValue?: TSecondary | null;
  readonly secondaryOptions?: readonly WorkspaceTabOption<TSecondary>[];
  readonly clearOnPrimaryChange?: readonly string[];
  readonly actions?: ReactNode;
  /**
   * Suppress the title/description row inside the surface card. The parent
   * shell is rendering its own page header (e.g. `AdminPage` with a `hero`
   * slot). Tab controls still render. Used to avoid stacking competing
   * headers above tabbed admin workspaces.
   */
  readonly headerless?: boolean;
  readonly children: ReactNode;
}

export function WorkspaceTabsSurface<
  TPrimary extends string,
  TSecondary extends string = never,
>({
  title,
  description,
  primaryParam,
  primaryValue,
  primaryOptions,
  secondaryParam,
  secondaryValue,
  secondaryOptions,
  clearOnPrimaryChange = [],
  actions,
  headerless = false,
  children,
}: Readonly<WorkspaceTabsSurfaceProps<TPrimary, TSecondary>>) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedSecondaryValue = secondaryValue ?? undefined;

  const buildHrefWithParam = useCallback(
    (param: string, value: string, resetKeys: readonly string[]) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set(param, value);

      for (const key of resetKeys) {
        nextParams.delete(key);
      }

      const query = nextParams.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [pathname, searchParams]
  );

  const secondaryControl = useMemo(() => {
    if (!secondaryParam || !secondaryOptions || secondaryOptions.length === 0) {
      return null;
    }

    if (!selectedSecondaryValue) {
      return null;
    }

    return (
      <LinkedTabBar
        value={selectedSecondaryValue}
        options={secondaryOptions}
        ariaLabel={`${title} secondary views`}
        getHref={value => buildHrefWithParam(secondaryParam, value, [])}
      />
    );
  }, [
    secondaryOptions,
    secondaryParam,
    selectedSecondaryValue,
    title,
    buildHrefWithParam,
  ]);

  const shouldShowPrimaryControl = primaryOptions.length > 1;
  const shouldShowTabControls = shouldShowPrimaryControl || secondaryControl;

  // When the parent renders its own header (e.g. AdminPage hero) we suppress
  // the surface's title/description but keep the tab card. If there are also
  // no tabs to show, omit the card entirely — the surface has nothing to
  // contribute beyond the children.
  if (headerless && !shouldShowTabControls) {
    return <div className='space-y-4'>{children}</div>;
  }

  return (
    <div className='space-y-4'>
      {headerless ? (
        shouldShowTabControls ? (
          <div className='border-b border-(--linear-app-frame-seam) pb-3'>
            <div className='flex flex-col gap-3'>
              {shouldShowPrimaryControl ? (
                <LinkedTabBar
                  value={primaryValue}
                  options={primaryOptions}
                  ariaLabel={`${title} primary views`}
                  getHref={value =>
                    buildHrefWithParam(primaryParam, value, [
                      ...PRIMARY_TAB_RESET_KEYS,
                      ...clearOnPrimaryChange,
                    ])
                  }
                />
              ) : null}
              {secondaryControl}
            </div>
          </div>
        ) : null
      ) : (
        <ContentSurfaceCard className='overflow-hidden'>
          <ContentSectionHeader
            title={title}
            subtitle={description}
            actions={actions}
            className='min-h-0 px-app-header py-3'
            actionsClassName='shrink-0'
          />
          {shouldShowTabControls ? (
            <div className='border-t border-subtle px-(--linear-app-content-padding-x) py-3'>
              <div className='flex flex-col gap-3'>
                {shouldShowPrimaryControl ? (
                  <LinkedTabBar
                    value={primaryValue}
                    options={primaryOptions}
                    ariaLabel={`${title} primary views`}
                    getHref={value =>
                      buildHrefWithParam(primaryParam, value, [
                        ...PRIMARY_TAB_RESET_KEYS,
                        ...clearOnPrimaryChange,
                      ])
                    }
                  />
                ) : null}
                {secondaryControl}
              </div>
            </div>
          ) : null}
        </ContentSurfaceCard>
      )}
      {children}
    </div>
  );
}

function LinkedTabBar<T extends string>({
  value,
  options,
  ariaLabel,
  getHref,
}: Readonly<{
  value: T;
  options: readonly WorkspaceTabOption<T>[];
  ariaLabel: string;
  getHref: (value: T) => string;
}>) {
  return (
    <div
      className='flex w-full items-start gap-2'
      data-overflow-mode='scroll'
      data-testid='drawer-tabs'
    >
      <div
        className='min-w-0 flex-1 overflow-x-auto overflow-y-hidden pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        data-testid='drawer-tabs-scroll'
      >
        <div
          role='tablist'
          aria-label={ariaLabel}
          className={cn(
            TAB_BAR_RAIL_CLASSNAME,
            'min-w-max flex-nowrap scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
          )}
        >
          {options.map(option => {
            const selected = value === option.value;
            const href = getHref(option.value);

            return (
              <Link
                key={option.value}
                href={href}
                prefetch={false}
                role='tab'
                data-testid={`drawer-tab-${option.value}`}
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={event => {
                  if (
                    event.defaultPrevented ||
                    event.button !== 0 ||
                    event.metaKey ||
                    event.altKey ||
                    event.ctrlKey ||
                    event.shiftKey
                  ) {
                    return;
                  }

                  event.preventDefault();
                  globalThis.location.assign(href);
                }}
                className={cn(
                  TAB_BAR_SEGMENT_TRIGGER_CLASSNAME,
                  selected && TAB_BAR_SEGMENT_TRIGGER_ACTIVE_CLASSNAME
                )}
              >
                {option.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
