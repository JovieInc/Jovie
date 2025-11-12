import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@jovie/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import * as React from 'react';
import { SidebarTrigger } from '@/components/organisms/Sidebar';
import { cn } from '@/lib/utils';
import { zIndex } from '@/lib/utils/z-index';

export interface DashboardBreadcrumbItem {
  label: string;
  href?: string;
}

interface DashboardTopBarProps {
  breadcrumbs: DashboardBreadcrumbItem[];
  actions?: ReactNode;
}

export function DashboardTopBar({
  breadcrumbs,
  actions,
}: DashboardTopBarProps) {
  return (
    <header
      className={cn(
        'sticky top-0 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-sidebar/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-sidebar/60',
        zIndex.sticky
      )}
    >
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <SidebarTrigger className='-ml-1' />
          </TooltipTrigger>
          <TooltipContent side='right'>
            <div className='flex items-center gap-2'>
              <span>Toggle sidebar</span>
              <kbd className='inline-flex items-center rounded border border-border bg-surface-1 px-1 font-mono text-xs'>
                ⌘ B
              </kbd>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Separator orientation='vertical' className='mr-2 h-4' />
      <Breadcrumb>
        <BreadcrumbList>
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;
            const isFirst = index === 0;

            return (
              <React.Fragment key={`${crumb.label}-${index}`}>
                <BreadcrumbItem
                  className={isFirst ? 'hidden md:block' : undefined}
                >
                  {crumb.href && !isLast ? (
                    <BreadcrumbLink asChild>
                      <Link href={crumb.href}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
                {!isLast && (
                  <BreadcrumbSeparator
                    className={isFirst ? 'hidden md:block' : undefined}
                  />
                )}
              </React.Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      {actions ? (
        <div className='ml-auto flex items-center gap-2'>{actions}</div>
      ) : null}
    </header>
  );
}
