import type { ReactNode } from 'react';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { PageToolbar } from '@/components/organisms/table';
import { cn } from '@/lib/utils';

interface AdminTableHeaderProps {
  readonly title: string;
  readonly subtitle: string;
  readonly actions?: ReactNode;
  readonly className?: string;
}

interface AdminTableSubheaderProps {
  readonly children?: ReactNode;
  readonly start?: ReactNode;
  readonly end?: ReactNode;
  readonly className?: string;
  /** Preserve toolbar geometry while a bulk-action overlay owns interaction. */
  readonly inert?: boolean;
}

export function AdminTableHeader({
  title,
  subtitle,
  actions,
  className,
}: Readonly<AdminTableHeaderProps>) {
  return (
    <ContentSectionHeader
      title={title}
      subtitle={subtitle}
      actions={actions}
      className={className}
    />
  );
}

export function AdminTableSubheader({
  children,
  start,
  end,
  className,
  inert = false,
}: Readonly<AdminTableSubheaderProps>) {
  const hasToolbar = start !== undefined || end !== undefined;
  const toolbarContent = hasToolbar ? (
    <PageToolbar start={start ?? null} end={end} />
  ) : (
    children
  );

  return (
    <div
      inert={inert}
      aria-hidden={inert || undefined}
      className={cn(
        hasToolbar
          ? 'bg-transparent'
          : 'border-b border-(--app-shell-frame-seam) bg-transparent px-app-header py-1',
        className
      )}
    >
      {toolbarContent}
    </div>
  );
}
