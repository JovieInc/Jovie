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
      className={cn('bg-(--linear-app-content-surface)', className)}
    />
  );
}

export function AdminTableSubheader({
  children,
  start,
  end,
  className,
}: Readonly<AdminTableSubheaderProps>) {
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
          : 'border-b border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) px-(--linear-app-header-padding-x) py-1.5',
        className
      )}
    >
      {toolbarContent}
    </div>
  );
}
