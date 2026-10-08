// @coverage-via apps/web/tests/unit/features/connectors/ConnectorCard.test.tsx
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
import { getGrantedConnectorCapabilities } from '@/lib/connectors/capabilities';
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
  readonly accountLabel?: string;
  readonly scopes?: readonly string[];
  readonly errorMessage?: string;
  readonly actionError?: string;
  readonly onConnect?: () => void;
  readonly onDisconnect?: () => void;
  readonly className?: string;
  readonly available?: boolean;
  readonly unavailableReason?: string;
  readonly lastSyncAt?: string;
  readonly pending?: boolean;
  readonly actionDisabled?: boolean;
  readonly pendingAction?: 'connect' | 'disconnect';
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
  unavailable: { label: 'Unavailable', variant: 'warning', icon: AlertCircle },
};

export function ConnectorCard({
  provider,
  status,
  accountLabel,
  scopes,
  errorMessage,
  actionError,
  onConnect,
  onDisconnect,
  className,
  available = true,
  unavailableReason,
  lastSyncAt,
  pending = false,
  actionDisabled = false,
  pendingAction,
}: ConnectorCardProps) {
  const definition = getConnectorDefinition(provider);
  const isSocialIcon =
    definition.iconKey === 'youtube' || definition.iconKey === 'spotify';
  const Icon = isSocialIcon ? null : CONNECTOR_ICONS[definition.iconKey];
  const {
    label: statusLabel,
    variant: statusVariant,
    icon: StatusIcon,
  } = STATUS_BADGE[
    (status === 'not_connected' || status === 'disabled') && !available
      ? 'unavailable'
      : status
  ];
  const isConnected = status === 'connected' || status === 'syncing';
  const needsAttention =
    status === 'error' || status === 'needs_reauth' || status === 'unavailable';
  const actionLabel = isConnected
    ? 'Disconnect'
    : status === 'not_connected'
      ? 'Connect'
      : 'Reconnect';
  const actionHandler = isConnected ? onDisconnect : onConnect;
  const canAct =
    Boolean(actionHandler) &&
    !actionDisabled &&
    !pending &&
    (isConnected || (available && status !== 'unavailable'));
  const normalizedError = errorMessage?.trim();
  const detailLine =
    actionError ||
    (!available || status === 'unavailable'
      ? (unavailableReason ?? 'Connection is unavailable. Try again later.')
      : isConnected
        ? accountLabel?.trim()
        : needsAttention
          ? normalizedError ||
            (status === 'needs_reauth'
              ? 'Reconnect to continue syncing.'
              : 'Connection failed. Try again.')
          : undefined);
  const grantedScopeLabels = definition.oauthScopes.flatMap((scope, index) => {
    const label = definition.oauthScopeLabels[index];
    return scopes?.includes(scope) && label ? [label] : [];
  });
  const grantedCapabilities = getGrantedConnectorCapabilities(
    definition,
    status,
    scopes ?? []
  );
  const missingCapabilities =
    isConnected &&
    scopes !== undefined &&
    grantedCapabilities.length <
      definition.capabilities.filter(
        capability => capability.availability === 'available'
      ).length;
  const syncedAt = lastSyncAt ? new Date(lastSyncAt) : null;
  const syncLabel =
    syncedAt && Number.isFinite(syncedAt.getTime())
      ? `Last synced ${syncedAt.toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC`
      : definition.syncRunner
        ? 'No completed sync recorded'
        : 'Sync runs when used';

  return (
    <div
      className={cn(
        'grid grid-cols-1 items-start gap-3 py-4 sm:flex sm:justify-between',
        className
      )}
      data-status={status}
      aria-busy={pending || status === 'syncing' ? true : undefined}
    >
      <div className='flex min-w-0 flex-1 gap-3'>
        {isSocialIcon ? (
          <div className='mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center'>
            <SocialIcon
              platform={definition.iconKey}
              className='h-4 w-4'
              aria-hidden
            />
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
          <p className='text-xs text-tertiary'>
            {definition.accountScope === 'identity'
              ? 'Selected identity'
              : 'Your signed-in account'}
          </p>
          <p
            className={cn(
              'min-h-4 text-xs',
              needsAttention ? 'text-error' : 'text-tertiary'
            )}
            data-testid={`connector-detail-${provider}`}
          >
            {detailLine ?? <span aria-hidden='true'>&nbsp;</span>}
          </p>
          {isConnected && grantedScopeLabels.length > 0 && (
            <ul
              className='text-xs text-tertiary'
              aria-label={`${definition.label} granted scopes`}
            >
              <li>Scopes: {grantedScopeLabels.join(', ')}</li>
            </ul>
          )}
          {isConnected && (
            <div className='min-h-8 text-xs text-tertiary'>
              <p>
                {grantedCapabilities.length > 0
                  ? grantedCapabilities
                      .map(capability => capability.label)
                      .join(' · ')
                  : 'No operation permissions verified'}
              </p>
              <p>{syncLabel}</p>
            </div>
          )}
          {missingCapabilities && (
            <p className='text-xs text-warning'>
              Some permissions are missing. Reconnect to enable them.
            </p>
          )}
        </div>
      </div>

      <div className='ml-11 flex min-w-0 shrink-0 flex-wrap justify-end gap-2 sm:ml-0'>
        {missingCapabilities && onConnect && (
          <Button
            variant='secondary'
            size='sm'
            onClick={onConnect}
            disabled={pending || actionDisabled || !available}
          >
            Reconnect
          </Button>
        )}
        {needsAttention && accountLabel && onDisconnect && (
          <Button
            variant='tertiary'
            destructive
            size='sm'
            onClick={onDisconnect}
            disabled={pending || actionDisabled}
            aria-label={`Disconnect ${definition.label}`}
          >
            Disconnect
          </Button>
        )}
        <Button
          variant={isConnected ? 'tertiary' : 'secondary'}
          destructive={isConnected}
          size='sm'
          onClick={actionHandler}
          disabled={!canAct}
          aria-label={`${actionLabel} ${definition.label}`}
          className='w-32'
        >
          {pending
            ? pendingAction === 'disconnect'
              ? 'Disconnecting…'
              : 'Connecting…'
            : actionLabel}
        </Button>
      </div>
    </div>
  );
}
