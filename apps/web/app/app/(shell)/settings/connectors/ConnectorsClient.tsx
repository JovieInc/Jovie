'use client';

import { Button } from '@jovie/ui';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import type { ConnectorStatus } from '@/components/features/connectors/ConnectorCard';
import { ConnectorCard } from '@/components/features/connectors/ConnectorCard';
import { SuggestedActionCard } from '@/components/features/connectors/SuggestedActionCard';
import { SettingsSection } from '@/components/features/dashboard/organisms/SettingsSection';
import { toast } from '@/components/feedback';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { IntegrationDirectory } from '@/components/organisms/integrations/IntegrationDirectory';
import { IntegrationRequestForm } from '@/components/organisms/integrations/IntegrationRequestForm';
import { APP_ROUTES } from '@/constants/routes';
import {
  type ConnectorDefinition,
  type ConnectorProviderId,
  getConnectorDefinitions,
} from '@/lib/connectors/registry';

interface ConnectorState {
  readonly status: ConnectorStatus;
  readonly email?: string;
  readonly errorMessage?: string;
}

interface SuggestedActionPreview {
  readonly id: string;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly venueName: string | null;
  readonly city: string | null;
  readonly region: string | null;
  readonly country: string | null;
  readonly confidence: number;
  readonly rationale: string;
  readonly sourceRef: { messageId: string; subject: string };
  readonly status:
    | 'pending'
    | 'approved'
    | 'executed'
    | 'rejected'
    | 'failed'
    | 'expired';
}

interface ConnectorsClientProps {
  readonly creatorProfileId?: string | null;
  readonly accounts?: Record<ConnectorProviderId, ConnectorState>;
  readonly gmail: ConnectorState;
  readonly calendar: ConnectorState;
  readonly suggestedActions: SuggestedActionPreview[];
  readonly isDev: boolean;
}

export function ConnectorsClient({
  creatorProfileId,
  accounts,
  gmail,
  calendar,
  suggestedActions,
  isDev,
}: ConnectorsClientProps) {
  const router = useRouter();
  const [isPendingExtract, startExtract] = useTransition();

  const handleConnect = (definition: ConnectorDefinition) => {
    if (definition.connectionScope === 'profile' && !creatorProfileId) {
      router.push(APP_ROUTES.LIBRARY);
      return;
    }
    const params = new URLSearchParams({
      returnTo: APP_ROUTES.SETTINGS_CONNECTORS,
    });
    if (definition.connectionScope === 'profile' && creatorProfileId)
      params.set('creatorProfileId', creatorProfileId);
    router.push(`${definition.authorizePath}?${params.toString()}`);
  };

  const handleDisconnect = async (definition: ConnectorDefinition) => {
    try {
      const res = await fetch(definition.disconnectPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          definition.connectionScope === 'profile' ? { creatorProfileId } : {}
        ),
      });
      if (!res.ok) throw new Error('Disconnect failed');
      toast.success(
        `${definition.oauthBundle === 'google' ? 'Google account connections' : definition.label} disconnected`
      );
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

  const isGoogleConnected =
    gmail.status === 'connected' || gmail.status === 'syncing';

  return (
    <SettingsSection
      id='connectors'
      title='Connections'
      // ui-casing-allow: sentence-case description (Found === Expected)
      description='Manage account connections and explore music integrations.'
    >
      <SettingsPanel title='Connected Accounts'>
        <div className='divide-y divide-subtle'>
          {getConnectorDefinitions().map(definition => {
            const state =
              accounts?.[definition.id] ??
              (definition.id === 'gmail'
                ? gmail
                : definition.id === 'google_calendar'
                  ? calendar
                  : { status: 'not_connected' as const });
            return (
              <ConnectorCard
                key={definition.id}
                provider={definition.id}
                {...state}
                onConnect={() => handleConnect(definition)}
                onDisconnect={() => void handleDisconnect(definition)}
              />
            );
          })}
        </div>
      </SettingsPanel>
      <SettingsPanel title='Explore Integrations'>
        <IntegrationDirectory />
        <IntegrationRequestForm />
      </SettingsPanel>

      {suggestedActions.length > 0 && (
        <SettingsPanel title='Suggested Actions'>
          <div className='space-y-3 pt-2'>
            {suggestedActions.map(action => (
              <SuggestedActionCard
                key={action.id}
                {...action}
                // Approve/Reject handlers are wired in C-PR-3.
              />
            ))}
          </div>
        </SettingsPanel>
      )}

      {isDev && isGoogleConnected && (
        <SettingsPanel title='Developer Tools'>
          <div className='py-2'>
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
