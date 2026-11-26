import { Card, type CardIntent } from '@jovie/ui';
import {
  type ComponentPropsWithoutRef,
  type ElementType,
  forwardRef,
} from 'react';
import { cn } from '@/lib/utils';

const CONTENT_SURFACE_BASE = 'border border-(--app-shell-border) shadow-none';

const CONTENT_SURFACE_CLASSES = {
  default: 'rounded-xl bg-surface-1',
  details: 'rounded-xl bg-surface-1',
  marketing: 'rounded-xl bg-surface-1',
  nested: 'rounded-lg bg-surface-0',
  settings: 'rounded-xl bg-surface-1',
  table: 'rounded-xl bg-surface-1',
} as const;

type ContentSurface = keyof typeof CONTENT_SURFACE_CLASSES;

/** Surface class lookup. A plain map, not an inline cva, so Card is not restyled by a variant table. */
const contentSurfaceCardVariants = (props?: {
  readonly surface?: ContentSurface | null;
}) =>
  `${CONTENT_SURFACE_BASE} ${CONTENT_SURFACE_CLASSES[props?.surface ?? 'default']}`;

export interface ContentSurfaceCardProps
  extends Omit<ComponentPropsWithoutRef<'div'>, 'children'>,
    Pick<
      NonNullable<Parameters<typeof contentSurfaceCardVariants>[0]>,
      'surface'
    > {
  readonly children?: ComponentPropsWithoutRef<'div'>['children'];
  readonly as?: ElementType;
  /** Why this box is a card. See "Card intent" in .claude/rules/ui.md. */
  readonly intent?: CardIntent;
}

export const ContentSurfaceCard = forwardRef<
  HTMLElement,
  ContentSurfaceCardProps
>(function ContentSurfaceCard(
  { children, as: Component = 'div', surface, intent, className, ...props },
  ref
) {
  return (
    <Card
      asChild
      unstyled
      intent={intent}
      className={cn(contentSurfaceCardVariants({ surface }), className)}
    >
      <Component ref={ref} {...props}>
        {children}
      </Component>
    </Card>
  );
});

export { contentSurfaceCardVariants };
