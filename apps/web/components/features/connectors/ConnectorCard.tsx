'use client';

import { Button } from '@jovie/ui';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Loader2,
  Mail,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/atoms/Badge';
import { cn } from '@/lib/utils';

export type ConnectorStatus =
  | 'not_connected'
  | 'connected'
  | 'syncing'
  | 'error'
  | 'needs_reauth'
  | 'disabled';

export type ConnectorProvider = 'gmail' | 'google_calendar';

interface ConnectorCardProps {
  readonly provider: ConnectorProvider;
  readonly status: ConnectorStatus;
  readonly email?: string;
  readonly errorMessage?: string;
  readonly onConnect?: () => void;
  readonly onDisconnect?: () => void;
  readonly className?: string;
}

const PROVIDER_META = {
  gmail: {
    label: 'Gmail',
    description: 'Scan booking emails for tour confirmation signals.',
    Icon: Mail,
  },
  google_calendar: {
    label: 'Google Calendar',
    description: 'Read events to detect conflicts and write approved bookings.',
    Icon: Calendar,
  },
} as const;

const STATUS_BADGE: Record<
  ConnectorStatus,
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
  }
> = {
  not_connected: { label: 'Not connected', variant: 'outline' },
  connected: { label: 'Connected', variant: 'default' },
  syncing: { label: 'Syncing', variant: 'secondary' },
  error: { label: 'Error', variant: 'destructive' },
  needs_reauth: { label: 'Reconnect needed', variant: 'destructive' },
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
  const { label, description, Icon } = PROVIDER_META[provider];
  const { label: statusLabel, variant: statusVariant } = STATUS_BADGE[status];
  const isConnected = status === 'connected' || status === 'syncing';

  return (
    <div
      className={cn('flex items-start justify-between gap-4 py-4', className)}
    >
      <div className='flex items-start gap-3'>
        <div className='mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-subtle bg-surface-0'>
          <Icon className='h-4 w-4 text-secondary' />
        </div>
        <div className='space-y-0.5'>
          <div className='flex items-center gap-2'>
            <span className='text-sm font-medium text-primary'>{label}</span>
            <Badge variant={statusVariant} className='text-xs'>
              {status === 'syncing' && (
                <Loader2 className='mr-1 h-3 w-3 animate-spin' />
              )}
              {status === 'connected' && (
                <CheckCircle2 className='mr-1 h-3 w-3' />
              )}
              {(status === 'error' || status === 'needs_reauth') && (
                <AlertCircle className='mr-1 h-3 w-3' />
              )}
              {status === 'syncing' && <RefreshCw className='mr-1 h-3 w-3' />}
              {statusLabel}
            </Badge>
          </div>
          <p className='text-xs text-secondary'>{description}</p>
          {email && isConnected && (
            <p className='text-xs text-tertiary'>{email}</p>
          )}
          {errorMessage &&
            (status === 'error' || status === 'needs_reauth') && (
              <p className='text-xs text-destructive'>{errorMessage}</p>
            )}
        </div>
      </div>

      <div className='shrink-0'>
        {!isConnected && status !== 'disabled' ? (
          <Button
            variant='outline'
            size='sm'
            onClick={onConnect}
            disabled={!onConnect}
          >
            Connect
          </Button>
        ) : isConnected ? (
          <Button
            variant='ghost'
            size='sm'
            onClick={onDisconnect}
            disabled={!onDisconnect}
            className='text-secondary hover:text-destructive'
          >
            Disconnect
          </Button>
        ) : (
          <Button
            variant='outline'
            size='sm'
            onClick={onConnect}
            disabled={!onConnect}
          >
            Reconnect
          </Button>
        )}
      </div>
    </div>
  );
}
