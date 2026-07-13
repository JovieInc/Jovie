import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { cn } from '@/lib/utils';

function createActionSkeletonItems(widths: readonly string[]) {
  const seen = new Map<string, number>();

  return widths.map(width => {
    const nextCount = (seen.get(width) ?? 0) + 1;
    seen.set(width, nextCount);

    return {
      key: nextCount === 1 ? width : `${width}-${nextCount}`,
      width,
    };
  });
}

export interface ContentSectionHeaderSkeletonProps {
  readonly titleWidth?: string;
  readonly descriptionWidth?: string;
  readonly actionWidths?: readonly string[];
  readonly className?: string;
  readonly bodyClassName?: string;
  readonly actionsClassName?: string;
}

export function ContentSectionHeaderSkeleton({
  titleWidth = 'w-40',
  descriptionWidth = 'w-64',
  actionWidths,
  className,
  bodyClassName,
  actionsClassName,
}: Readonly<ContentSectionHeaderSkeletonProps>) {
  const items = createActionSkeletonItems(actionWidths ?? []);

  return (
    <div
      className={cn(
        'flex min-h-(--linear-app-header-height) min-w-0 shrink-0 items-center justify-between gap-3 overflow-x-auto overflow-y-hidden border-b border-subtle bg-transparent px-(--linear-app-header-padding-x) py-1.5 scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className
      )}
      aria-hidden='true'
    >
      <div className={cn('min-w-0 flex-1 space-y-1.5', bodyClassName)}>
        <LoadingSkeleton height='h-5' width={titleWidth} rounded='md' />
        <LoadingSkeleton height='h-4' width={descriptionWidth} rounded='md' />
      </div>

      {items.length > 0 ? (
        <div
          className={cn(
            'flex shrink-0 items-center justify-end gap-2',
            actionsClassName
          )}
        >
          {items.map(({ key, width }) => (
            <LoadingSkeleton
              key={key}
              height='h-8'
              width={width}
              rounded='md'
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
