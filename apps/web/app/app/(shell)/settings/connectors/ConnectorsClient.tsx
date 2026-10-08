'use client';

import { Button } from '@jovie/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { ConnectorStatus } from '@/components/features/connectors/ConnectorCard';
import { ConnectorCard } from '@/components/features/connectors/ConnectorCard';
import { SettingsSection } from '@/components/features/dashboard/organisms/SettingsSection';
import { toast } from '@/components/feedback';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { APP_ROUTES } from '@/constants/routes';
import {
  CONNECTOR_PROVIDERS,
  type ConnectorProviderId,
  getConnectorDefinition,
  getConnectorDefinitions,
} from '@/lib/connectors/registry';

const CONNECTOR_DEFINITIONS = getConnectorDefinitions();

interface ConnectorState {
  readonly status: ConnectorStatus;
  readonly accountLabel?: string;
  readonly scopes?: readonly string[];
  readonly errorMessage?: string;
  readonly available?: boolean;
  readonly unavailableReason?: string;
  readonly lastSyncAt?: string;
}

interface ConnectorsClientProps {
  readonly connectors: Readonly<Record<ConnectorProviderId, ConnectorState>>;
  readonly creatorProfileId: string | null;
  readonly isDev: boolean;
  readonly returnTo?: string;
}

export function ConnectorsClient({
  connectors,
  creatorProfileId,
  isDev,
  returnTo = APP_ROUTES.SETTINGS_CONNECTORS,
}: ConnectorsClientProps) {
  const router = useRouter();
  const oauthFailed = Boolean(useSearchParams().get('error'));
  const [isPendingExtract, startExtract] = useTransition();
  const [pendingBundle, setPendingBundle] = useState<string | null>(null);
  const [disconnected, setDisconnected] = useState<readonly string[]>([]);
  const [pendingAction, setPendingAction] = useState<'connect' | 'disconnect'>(
    'connect'
  );
  const [actionErrors, setActionErrors] = useState<
    Partial<Record<ConnectorProviderId, string>>
  >({});

  const handleConnect = (provider: ConnectorProviderId) => {
    const definition = getConnectorDefinition(provider);
    if (pendingBundle || connectors[provider].available === false) return;
    const params = new URLSearchParams({
      returnTo,
    });
    if (provider === CONNECTOR_PROVIDERS.youtube) {
      if (!creatorProfileId) {
        toast.error('Select an identity before connecting YouTube.');
        return;
      }
      params.set('creatorProfileId', creatorProfileId);
    }
    setPendingAction('connect');
    setPendingBundle(definition.oauthBundle);
    router.push(
      `/api/connectors/${definition.oauthBundle}/authorize?${params.toString()}`
    );
  };

  const handleDisconnect = async (provider: ConnectorProviderId) => {
    const definition = getConnectorDefinition(provider);
    if (pendingBundle) return;
    setPendingAction('disconnect');
    setPendingBundle(definition.oauthBundle);
    setActionErrors(errors => ({ ...errors, [provider]: undefined }));
    try {
      const requestInit: RequestInit = {
        method: 'POST',
      };
      if (provider === CONNECTOR_PROVIDERS.youtube) {
        if (!creatorProfileId) {
          toast.error('Select an identity before disconnecting YouTube.');
          return;
        }
        requestInit.headers = { 'Content-Type': 'application/json' };
        requestInit.body = JSON.stringify({ creatorProfileId });
      } else if (definition.oauthBundle === 'google') {
        requestInit.headers = { 'Content-Type': 'application/json' };
        requestInit.body = JSON.stringify({});
      }
      const res = await fetch(
        `/api/connectors/${definition.oauthBundle}/disconnect`,
        requestInit
      );
      if (!res.ok) throw new Error('Disconnect failed');
      setDisconnected(bundles => [...bundles, definition.oauthBundle]);
      toast.success(`${definition.label} disconnected`);
      router.refresh();
    } catch {
      const message = 'Failed to disconnect. Try again.';
      setActionErrors(errors => ({ ...errors, [provider]: message }));
      toast.error(message);
    } finally {
      setPendingBundle(null);
    }
  };

  const handleExtractNow = () => {
    startExtract(async () => {
      try {
        const res = await fetch('/api/dev/connectors/extract-now', {
          method: 'POST',
        });
        const data = (await res.json()) as {
          suggestedActionsCreated?: number;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? 'Extract failed');
        toast.success(
          `Extraction complete — ${data.suggestedActionsCreated ?? 0} new suggestion(s)`
        );
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Extraction failed');
      }
    });
  };

  const isGoogleConnected = [
    connectors[CONNECTOR_PROVIDERS.gmail],
    connectors[CONNECTOR_PROVIDERS.google_calendar],
  ].some(
    connector =>
      connector.status === 'connected' || connector.status === 'syncing'
  );

  return (
    <SettingsSection
      id='connectors'
      title='Integrations'
      // ui-casing-allow: sentence-case description (Found === Expected)
      description='Connect the services Jovie uses to understand and manage your work.'
    >
      <SettingsPanel title='Connected Accounts' bodyClassName='px-4 sm:px-5'>
        {oauthFailed && (
          <p role='alert' className='py-3 text-xs text-error'>
            The connection did not finish. Check the account status below, then
            try connecting again.
          </p>
        )}
        <p className='pb-3 text-xs text-tertiary'>
          Gmail and Calendar share a Google connection. Disconnecting either
          removes both.
        </p>
        <div className='divide-y divide-subtle'>
          {CONNECTOR_DEFINITIONS.map(definition => {
            const connector = connectors[definition.id];
            return (
              <ConnectorCard
                key={definition.id}
                provider={definition.id}
                status={
                  disconnected.includes(definition.oauthBundle)
                    ? 'disabled'
                    : connector.status
                }
                accountLabel={connector.accountLabel}
                scopes={connector.scopes}
                errorMessage={connector.errorMessage}
                actionError={actionErrors[definition.id]}
                available={
                  connector.available !== false &&
                  (definition.accountScope !== 'identity' ||
                    Boolean(creatorProfileId))
                }
                unavailableReason={
                  connector.unavailableReason ??
                  (definition.accountScope === 'identity' && !creatorProfileId
                    ? 'Select an identity to connect this account.'
                    : undefined)
                }
                lastSyncAt={connector.lastSyncAt}
                pending={pendingBundle === definition.oauthBundle}
                actionDisabled={
                  Boolean(pendingBundle) &&
                  pendingBundle !== definition.oauthBundle
                }
                pendingAction={pendingAction}
                onConnect={() => handleConnect(definition.id)}
                onDisconnect={() => handleDisconnect(definition.id)}
              />
            );
          })}
        </div>
      </SettingsPanel>

      {isDev && isGoogleConnected && (
        <SettingsPanel
          title='Developer Tools'
          bodyClassName='px-4 py-3 sm:px-5'
        >
          <div>
            <Button
              variant='outline'
              size='sm'
              onClick={handleExtractNow}
              disabled={isPendingExtract}
            >
              {isPendingExtract ? 'Extracting…' : 'Extract now (dev)'}
            </Button>
            <p className='mt-1 text-xs text-tertiary'>
              Triggers Gmail extraction immediately. Only available in
              development.
            </p>
          </div>
        </SettingsPanel>
      )}
    </SettingsSection>
  );
}
