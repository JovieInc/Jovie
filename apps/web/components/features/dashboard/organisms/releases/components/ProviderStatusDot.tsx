import { Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { Check, Dot, TriangleAlert } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * ProviderStatusDot
 *
 * Small badge shown next to a release's provider link (Spotify, Apple Music,
 * etc.) in the dashboard Releases table. It communicates how the link was
 * obtained so an artist can tell at a glance whether a row was auto-synced or
 * needs their attention.
 *
 * Status -> meaning -> presentation matrix:
 *
 *   available  Auto-synced provider link (pulled from the provider API).
 *              Accent-colored ring + Check icon. The accent is the provider's
 *              brand color (e.g. Spotify green) so the dot reads as "on-brand,
 *              connected".
 *
 *   manual     Manually added provider link (artist pasted a URL).
 *              Warning color + TriangleAlert icon. Signals "this exists but
 *              wasn't verified against the provider".
 *
 *   missing    No provider link on file.
 *              Neutral surface color + Dot icon. Signals "nothing here yet".
 *
 * Color is never the only signal:
 *  - each state uses a distinct icon (Check / TriangleAlert / Dot)
 *  - each state exposes an aria-label + visually-hidden text for SR users
 *  - each state is wrapped in a Tooltip so sighted users can read the label
 *  - `data-provider-status` is emitted for tests and styling hooks
 *
 * Colors resolve via design tokens (`--color-warning`, `--linear-*`) and the
 * provider accent string, so light/dark parity is inherited from the theme.
 */

const PROVIDER_STATUS_LABELS = {
  available: 'Auto-synced provider link',
  manual: 'Manually added provider link',
  missing: 'Missing provider link',
} as const;

type ProviderStatus = keyof typeof PROVIDER_STATUS_LABELS;

interface ProviderStatusDotProps {
  readonly status: ProviderStatus;
  readonly accent: string;
}

function getProviderStatusConfig(
  status: ProviderStatus,
  accent: string
): {
  label: string;
  icon: ReactNode;
  className: string;
  style?: React.CSSProperties;
} {
  switch (status) {
    case 'available':
      return {
        label: PROVIDER_STATUS_LABELS.available,
        icon: <Check className='h-2.5 w-2.5' aria-hidden='true' />,
        className: 'shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
        style: {
          backgroundColor: `color-mix(in oklab, ${accent} 12%, transparent)`,
          borderColor: `color-mix(in oklab, ${accent} 28%, var(--linear-app-frame-seam))`,
          color: accent,
        },
      };
    case 'manual':
      return {
        label: PROVIDER_STATUS_LABELS.manual,
        icon: <TriangleAlert className='h-2.5 w-2.5' aria-hidden='true' />,
        className:
          'border-[color:color-mix(in_oklab,var(--color-warning)_28%,var(--linear-app-frame-seam))] bg-[color:color-mix(in_oklab,var(--color-warning)_12%,transparent)] text-[var(--color-warning)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
      };
    default:
      return {
        label: PROVIDER_STATUS_LABELS.missing,
        icon: <Dot className='h-2.5 w-2.5' aria-hidden='true' />,
        className:
          'border-subtle bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_82%,var(--linear-bg-surface-0))] text-tertiary-token',
      };
  }
}

export const ProviderStatusDot = memo(function ProviderStatusDot({
  status,
  accent,
}: Readonly<ProviderStatusDotProps>) {
  const config = getProviderStatusConfig(status, accent);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role='img'
          className={cn(
            'inline-flex h-4 w-4 items-center justify-center rounded-full border',
            config.className
          )}
          style={config.style}
          aria-label={config.label}
          data-provider-status={status}
        >
          {config.icon}
          <span className='sr-only'>{config.label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side='top'>{config.label}</TooltipContent>
    </Tooltip>
  );
});
