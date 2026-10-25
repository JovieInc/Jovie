import { MARKETING_CONTAINER_PEN_CONTRACT_BY_WIDTH } from '@/data/marketing/penContracts';
import { cn } from '@/lib/utils';

/**
 * Width variant -> container classes.
 *
 * There is ONE boxed public width: `.public-container` (design-system.css),
 * which is `--ds-public-content-max` with the `--ds-public-gutter` steps.
 * Header, hero, sections and footer share it so content edges line up.
 * `landing` and `page` are aliases of it. `bleed` below is the only override.
 *
 * `prose` is a reading measure (`--ds-prose-max`, 680px), not a second page
 * box. It is centered in the viewport and uses the same gutter.
 */
const widthClasses = {
  /** @deprecated Use `'page'`. Kept as a source-compatible alias. */
  landing: 'public-container',
  page: 'public-container',
  prose: 'mx-auto w-full max-w-prose-canonical px-(--ds-public-gutter)',
} as const;

export interface MarketingContainerProps {
  readonly width: 'landing' | 'page' | 'prose';
  /** The one full-bleed override: edge to edge, no box, no gutter. */
  readonly bleed?: boolean;
  readonly className?: string;
  readonly children: React.ReactNode;
}

/**
 * Centered container on the single public content width.
 */
export function MarketingContainer({
  width,
  bleed = false,
  className,
  children,
}: MarketingContainerProps) {
  return (
    <div
      data-pen-contract={MARKETING_CONTAINER_PEN_CONTRACT_BY_WIDTH[width]}
      className={cn(
        widthClasses[width],
        bleed && 'public-container--bleed',
        className
      )}
    >
      {children}
    </div>
  );
}
