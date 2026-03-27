import type { ReactNode } from 'react';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { cn } from '@/lib/utils';
import { PageToolbar } from './PageToolbar';

interface TableSurfaceHeaderProps {
  readonly title: string;
  readonly subtitle: string;
  readonly actions?: ReactNode;
  readonly className?: string;
}

interface TableSurfaceToolbarProps {
  readonly children?: ReactNode;
  readonly start?: ReactNode;
  readonly end?: ReactNode;
  readonly className?: string;
}

export function TableSurfaceHeader({
  title,
  subtitle,
  actions,
  className,
}: Readonly<TableSurfaceHeaderProps>) {
  return (
    <ContentSectionHeader
      title={title}
      subtitle={subtitle}
      actions={actions}
      className={cn('bg-(--linear-app-content-surface)', className)}
    />
  );
}

export function TableSurfaceToolbar({
  children,
  start,
  end,
  className,
}: Readonly<TableSurfaceToolbarProps>) {
  const hasToolbar = start !== undefined || end !== undefined;
  const toolbarContent = hasToolbar ? (
    <PageToolbar start={start ?? null} end={end} />
  ) : (
    children
  );

  return (
    <div
      className={cn(
        hasToolbar
          ? 'bg-(--linear-app-content-surface)'
          : 'border-b border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) px-(--linear-app-header-padding-x) py-1',
        className
      )}
    >
      {toolbarContent}
    </div>
  );
}
