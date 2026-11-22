import { contentRowType } from '@/components/organisms/table/atoms/ShellListRowFrame';
import { cn } from '@/lib/utils';

type ShippingRowAttention = 'blocked' | 'failing' | 'stalled' | 'queued' | 'ok';

/**
 * Title and metadata block of a Shipping row, in the canonical content-row
 * type recipe. Attention shows only as a small leading error dot (blocked or
 * failing) plus the metadata label; rows never get a tint or a side border.
 */
export function ShippingRowWork({
  title,
  identifier,
  prNumber,
  attention,
  attentionLabel,
}: Readonly<{
  title: string;
  identifier: string;
  prNumber: number | null;
  attention: ShippingRowAttention;
  attentionLabel: string | null;
}>) {
  const showDot = attention === 'blocked' || attention === 'failing';
  return (
    <div aria-hidden='true' className='min-w-0'>
      <div className='flex min-w-0 items-center gap-1.5'>
        {showDot ? (
          <span
            data-attention-dot={attention}
            className='size-1.5 shrink-0 rounded-full bg-error'
          />
        ) : null}
        <span className={cn('truncate', contentRowType.title)}>{title}</span>
      </div>
      <div className={cn('truncate', contentRowType.meta)}>
        {identifier}
        {prNumber != null ? ` · #${prNumber}` : ''}
        {attentionLabel ? ` · ${attentionLabel}` : ''}
      </div>
    </div>
  );
}
