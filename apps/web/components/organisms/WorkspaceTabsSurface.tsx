'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback, useMemo } from 'react';
import { AppSegmentControl } from '@/components/atoms/AppSegmentControl';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';

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
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedSecondaryValue = secondaryValue ?? undefined;

  const navigateWithParam = useCallback(
    (param: string, value: string, resetKeys: readonly string[]) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set(param, value);

      for (const key of resetKeys) {
        nextParams.delete(key);
      }

      const query = nextParams.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    },
    [pathname, router, searchParams]
  );

  const secondaryControl = useMemo(() => {
    if (!secondaryParam || !secondaryOptions || secondaryOptions.length === 0) {
      return null;
    }

    if (!selectedSecondaryValue) {
      return null;
    }

    return (
      <AppSegmentControl
        value={selectedSecondaryValue}
        onValueChange={value => navigateWithParam(secondaryParam, value, [])}
        options={secondaryOptions}
        size='sm'
        surface='ghost'
        aria-label={`${title} secondary views`}
      />
    );
  }, [
    secondaryOptions,
    secondaryParam,
    selectedSecondaryValue,
    title,
    navigateWithParam,
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
      <ContentSurfaceCard className='overflow-hidden'>
        {headerless ? null : (
          <ContentSectionHeader
            title={title}
            subtitle={description}
            actions={actions}
            className='min-h-0 px-(--linear-app-header-padding-x) py-3'
            actionsClassName='shrink-0'
          />
        )}
        {shouldShowTabControls ? (
          <div
            className={
              headerless
                ? 'px-(--linear-app-content-padding-x) py-3'
                : 'border-t border-subtle px-(--linear-app-content-padding-x) py-3'
            }
          >
            <div className='flex flex-col gap-3'>
              {shouldShowPrimaryControl ? (
                <AppSegmentControl
                  value={primaryValue}
                  onValueChange={value =>
                    navigateWithParam(primaryParam, value, [
                      ...PRIMARY_TAB_RESET_KEYS,
                      ...clearOnPrimaryChange,
                    ])
                  }
                  options={primaryOptions}
                  size='sm'
                  aria-label={`${title} primary views`}
                />
              ) : null}
              {secondaryControl}
            </div>
          </div>
        ) : null}
      </ContentSurfaceCard>
      {children}
    </div>
  );
}
