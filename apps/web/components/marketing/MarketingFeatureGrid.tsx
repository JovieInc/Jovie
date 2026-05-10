interface MarketingFeatureGridItem {
  readonly title: string;
  readonly description: string;
}

export interface MarketingFeatureGridProps {
  readonly items: readonly MarketingFeatureGridItem[];
  readonly className?: string;
}

/**
 * Two-column feature grid used on marketing pages.
 *
 * Each item renders a small heading + body paragraph. No icons, no cards —
 * keeps the page restrained per the marketing taste rules.
 */
export function MarketingFeatureGrid({
  items,
  className,
}: MarketingFeatureGridProps) {
  return (
    <div className={className ?? 'mt-8 grid gap-8 sm:grid-cols-2'}>
      {items.map(item => (
        <div key={item.title}>
          <h3 className='font-medium text-primary-token'>{item.title}</h3>
          <p className='mt-2 text-sm leading-relaxed text-secondary-token'>
            {item.description}
          </p>
        </div>
      ))}
    </div>
  );
}
