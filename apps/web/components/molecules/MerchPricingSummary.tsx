import { cn } from '@/lib/utils';

export function MerchPricingSummary({
  salePrice,
  profit,
  className,
  compact = false,
}: {
  readonly salePrice: string;
  readonly profit: string;
  readonly className?: string;
  readonly compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'grid min-h-15 grid-cols-2 gap-1',
        compact && 'min-h-12',
        className
      )}
      data-testid='merch-pricing-summary'
    >
      <span
        className={cn(
          'rounded-md bg-surface-1 px-1.5 py-1 text-3xs text-secondary-token'
        )}
      >
        <span className='text-tertiary-token'>Sale </span>
        <span className='font-medium text-primary-token'>{salePrice}</span>
      </span>
      <span
        className={cn(
          'rounded-md bg-surface-1 px-1.5 py-1 text-3xs text-secondary-token'
        )}
      >
        <span className='text-tertiary-token'>Profit </span>
        <span className='font-medium text-primary-token'>{profit}</span>
      </span>
    </div>
  );
}
