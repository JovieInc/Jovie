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
  children,
}: Readonly<WorkspaceTabsSurfaceProps<TPrimary, TSecondary>>) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedSecondaryValue = secondaryValue ?? undefined;

  const navigateWithParam = useCallback(
    (param: string, value: string, resetKeys: string[]) => {
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

  return (
    <div className='space-y-4'>
      <ContentSurfaceCard className='overflow-hidden'>
        <ContentSectionHeader
          title={title}
          subtitle={description}
          actions={actions}
          className='min-h-0 px-(--linear-app-header-padding-x) py-3'
          actionsClassName='shrink-0'
        />
        <div className='border-t border-subtle px-(--linear-app-content-padding-x) py-3'>
          <div className='flex flex-col gap-3'>
            <AppSegmentControl
              value={primaryValue}
              onValueChange={value =>
                navigateWithParam(primaryParam, value, [
                  ...clearOnPrimaryChange,
                ])
              }
              options={primaryOptions}
              size='sm'
              aria-label={`${title} primary views`}
            />
            {secondaryControl}
          </div>
        </div>
      </ContentSurfaceCard>
      {children}
    </div>
  );
}
