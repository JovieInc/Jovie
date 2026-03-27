import { Check, Dot, TriangleAlert } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ProviderStatusDotProps {
  readonly status: 'available' | 'manual' | 'missing';
  readonly accent: string;
}

export const ProviderStatusDot = memo(function ProviderStatusDot({
  status,
  accent,
}: Readonly<ProviderStatusDotProps>) {
  const config: {
    label: string;
    icon: ReactNode;
    className: string;
    style?: React.CSSProperties;
  } =
    status === 'available'
      ? {
          label: 'Auto-synced provider link',
          icon: <Check className='h-2.5 w-2.5' aria-hidden='true' />,
          className: 'shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
          style: {
            backgroundColor: `color-mix(in oklab, ${accent} 12%, transparent)`,
            borderColor: `color-mix(in oklab, ${accent} 28%, var(--linear-app-frame-seam))`,
            color: accent,
          },
        }
      : status === 'manual'
        ? {
            label: 'Manually added provider link',
            icon: <TriangleAlert className='h-2.5 w-2.5' aria-hidden='true' />,
            className:
              'border-[color:color-mix(in_oklab,var(--color-warning)_28%,var(--linear-app-frame-seam))] bg-[color:color-mix(in_oklab,var(--color-warning)_12%,transparent)] text-[var(--color-warning)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
          }
        : {
            label: 'Missing provider link',
            icon: <Dot className='h-2.5 w-2.5' aria-hidden='true' />,
            className:
              'border-subtle bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_82%,var(--linear-bg-surface-0))] text-tertiary-token',
          };

  return (
    <span
      role='img'
      className={cn(
        'inline-flex h-4 w-4 items-center justify-center rounded-full border',
        config.className
      )}
      style={config.style}
      title={config.label}
      aria-label={config.label}
      data-provider-status={status}
    >
      {config.icon}
      <span className='sr-only'>{config.label}</span>
    </span>
  );
});
