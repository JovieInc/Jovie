import { cn } from '@/lib/utils';

export interface MarketingPageShellProps {
  readonly className?: string;
  readonly children: React.ReactNode;
}

export function MarketingPageShell({
  className,
  children,
}: Readonly<MarketingPageShellProps>) {
  return (
    <div className={cn('relative min-h-screen', className)}>{children}</div>
  );
}
