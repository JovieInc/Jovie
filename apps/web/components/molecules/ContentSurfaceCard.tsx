import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const CONTENT_SURFACE_CARD_CLASSNAME =
  'rounded-xl border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]';

export interface ContentSurfaceCardProps {
  readonly children?: ReactNode;
  readonly as?: ElementType;
  readonly className?: string;
}

export function ContentSurfaceCard({
  children,
  as: Component = 'div',
  className,
}: Readonly<ContentSurfaceCardProps>) {
  return (
    <Component className={cn(CONTENT_SURFACE_CARD_CLASSNAME, className)}>
      {children}
    </Component>
  );
}
