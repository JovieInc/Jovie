'use client';

import { Button } from '@jovie/ui';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
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
}

interface ConnectorsClientProps {
  readonly connectors: Readonly<Record<ConnectorProviderId, ConnectorState>>;
  readonly creatorProfileId: string | null;
  readonly isDev: boolean;
}

export function ConnectorsClient({
  connectors,
  creatorProfileId,
  isDev,
}: ConnectorsClientProps) {
  const router = useRouter();
  const [isPendingExtract, startExtract] = useTransition();

  const handleConnect = (provider: ConnectorProviderId) => {
    const definition = getConnectorDefinition(provider);
    const params = new URLSearchParams({
      returnTo: APP_ROUTES.SETTINGS_CONNECTORS,
    });
    if (provider === CONNECTOR_PROVIDERS.youtube) {
      if (!creatorProfileId) {
        toast.error('Select an artist profile before connecting YouTube.');
        return;
      }
      params.set('creatorProfileId', creatorProfileId);
    }
    router.push(
      `/api/connectors/${definition.oauthBundle}/authorize?${params.toString()}`
    );
  };

  const handleDisconnect = async (provider: ConnectorProviderId) => {
    const definition = getConnectorDefinition(provider);
    try {
      const requestInit: RequestInit = {
        method: 'POST',
      };
      if (provider === CONNECTOR_PROVIDERS.youtube) {
        if (!creatorProfileId) {
          toast.error('Select an artist profile before disconnecting YouTube.');
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
      toast.success(`${definition.label} disconnected`);
      router.refresh();
    } catch {
      toast.error('Failed to disconnect. Please try again.');
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
      title='Connections'
      // ui-casing-allow: sentence-case description (Found === Expected)
      description='Connect the services Jovie uses to understand and manage your work.'
    >
      <SettingsPanel title='Connected Apps' bodyClassName='px-4 sm:px-5'>
        <div className='divide-y divide-subtle'>
          {CONNECTOR_DEFINITIONS.map(definition => {
            const connector = connectors[definition.id];
            return (
              <ConnectorCard
                key={definition.id}
                provider={definition.id}
                status={connector.status}
                accountLabel={connector.accountLabel}
                scopes={connector.scopes}
                errorMessage={connector.errorMessage}
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
