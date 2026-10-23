import { cn } from '@/lib/utils';
import './MarketingRoundedFrame.css';

/** Hero settled radius (`--system-b-radius-panel`). */
export const MARKETING_ROUNDED_FRAME_CLASS = 'marketing-rounded-frame';

export function MarketingRoundedFrame({
  children,
  className,
}: Readonly<{ children: React.ReactNode; className?: string }>) {
  return (
    <div className={cn('marketing-rounded-frame', className)}>{children}</div>
  );
}
