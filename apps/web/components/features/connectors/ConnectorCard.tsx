'use client';

import { Badge, Button } from '@jovie/ui';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Loader2,
  type LucideIcon,
  Mail,
  RefreshCw,
} from 'lucide-react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import {
  type ConnectorIconKey,
  type ConnectorProviderId,
  type ConnectorStatus,
  getConnectorDefinition,
} from '@/lib/connectors/registry';
import { cn } from '@/lib/utils';

export type {
  ConnectorProviderId as ConnectorProvider,
  ConnectorStatus,
} from '@/lib/connectors/registry';

interface ConnectorCardProps {
  readonly provider: ConnectorProviderId;
  readonly status: ConnectorStatus;
  readonly email?: string;
  readonly errorMessage?: string;
  readonly onConnect?: () => void;
  readonly onDisconnect?: () => void;
  readonly className?: string;
}

const CONNECTOR_ICONS = {
  mail: Mail,
  calendar: Calendar,
} as const satisfies Partial<Record<ConnectorIconKey, typeof Mail>>;

const STATUS_BADGE: Record<
  ConnectorStatus,
  {
    label: string;
    variant:
      | 'default'
      | 'secondary'
      | 'destructive'
      | 'outline'
      | 'success'
      | 'warning';
    icon?: LucideIcon;
  }
> = {
  not_connected: { label: 'Not Connected', variant: 'outline' },
  connected: {
    label: 'Connected',
    variant: 'success',
    icon: CheckCircle2,
  },
  syncing: { label: 'Syncing', variant: 'secondary', icon: Loader2 },
  error: { label: 'Error', variant: 'destructive', icon: AlertCircle },
  needs_reauth: {
    label: 'Reconnect Needed',
    variant: 'warning',
    icon: RefreshCw,
  },
  disabled: { label: 'Disconnected', variant: 'outline' },
};

export function ConnectorCard({
  provider,
  status,
  email,
  errorMessage,
  onConnect,
  onDisconnect,
  className,
}: ConnectorCardProps) {
  const definition = getConnectorDefinition(provider);
  const Icon =
    definition.iconKey === 'youtube'
      ? null
      : CONNECTOR_ICONS[definition.iconKey];
  const {
    label: statusLabel,
    variant: statusVariant,
    icon: StatusIcon,
  } = STATUS_BADGE[status];
  const isConnected = status === 'connected' || status === 'syncing';
  const needsAttention = status === 'error' || status === 'needs_reauth';
  const actionLabel = isConnected
    ? 'Disconnect'
    : status === 'not_connected'
      ? 'Connect'
      : 'Reconnect';
  const actionHandler = isConnected ? onDisconnect : onConnect;
  const normalizedError = errorMessage?.trim();
  const detailLine = isConnected
    ? email?.trim()
    : needsAttention
      ? normalizedError ||
        (status === 'needs_reauth'
          ? 'Reconnect to continue syncing.'
          : 'Connection failed. Try again.')
      : undefined;

  return (
    <div
      className={cn('flex items-start justify-between gap-3 py-4', className)}
      data-status={status}
      aria-busy={status === 'syncing' ? true : undefined}
    >
      <div className='flex min-w-0 flex-1 gap-3'>
        {provider === 'youtube' ? (
          <div className='mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center'>
            <SocialIcon platform='youtube' className='h-4 w-4' aria-hidden />
          </div>
        ) : (
          <div className='mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center'>
            {Icon && (
              <Icon className='h-4 w-4 text-secondary' aria-hidden='true' />
            )}
          </div>
        )}
        <div className='min-w-0 space-y-0.5'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='text-sm font-medium text-primary'>
              {definition.label}
            </span>
            <Badge
              variant={statusVariant}
              size='sm'
              role='status'
              aria-label={`${definition.label} status: ${statusLabel}`}
            >
              {StatusIcon && (
                <StatusIcon
                  aria-hidden='true'
                  className={cn(
                    'h-3 w-3',
                    status === 'syncing' &&
                      'animate-spin motion-reduce:animate-none'
                  )}
                />
              )}
              {statusLabel}
            </Badge>
          </div>
          <p className='text-xs text-secondary'>{definition.description}</p>
          <p
            className={cn(
              'min-h-4 text-xs',
              needsAttention ? 'text-error' : 'text-tertiary'
            )}
            data-testid={`connector-detail-${provider}`}
          >
            {detailLine ?? <span aria-hidden='true'>&nbsp;</span>}
          </p>
        </div>
      </div>

      <div className='shrink-0'>
        <Button
          variant={isConnected ? 'tertiary' : 'secondary'}
          destructive={isConnected}
          size='sm'
          onClick={actionHandler}
          disabled={!actionHandler}
          className='min-w-24'
        >
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}
