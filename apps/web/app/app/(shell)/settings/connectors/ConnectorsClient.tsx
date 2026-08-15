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
import { APP_ROUTES } from '@/constants/routes';
import type {
  ConnectorOAuthBundle,
  ConnectorProviderId,
} from '@/lib/connectors/registry';

interface ConnectorState {
  readonly provider: ConnectorProviderId;
  readonly label: string;
  readonly oauthBundle: ConnectorOAuthBundle;
  readonly status: ConnectorStatus;
  readonly accountLabel?: string;
  readonly errorMessage?: string;
  readonly scopes?: string[];
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
  readonly providers: readonly ConnectorState[];
  readonly suggestedActions: SuggestedActionPreview[];
  readonly isDev: boolean;
}

const AUTHORIZE_PATH: Record<ConnectorOAuthBundle, string> = {
  google: '/api/connectors/google/authorize',
  youtube: '/api/connectors/youtube/authorize',
};

const DISCONNECT_PATH: Record<ConnectorOAuthBundle, string> = {
  google: '/api/connectors/google/disconnect',
  youtube: '/api/connectors/youtube/disconnect',
};

function groupByBundle(
  providers: readonly ConnectorState[]
): Array<{ bundle: ConnectorOAuthBundle; items: ConnectorState[] }> {
  const order: ConnectorOAuthBundle[] = ['google', 'youtube'];
  return order
    .map(bundle => ({
      bundle,
      items: providers.filter(p => p.oauthBundle === bundle),
    }))
    .filter(group => group.items.length > 0);
}

function bundleTitle(bundle: ConnectorOAuthBundle): string {
  switch (bundle) {
    case 'google':
      return 'Google Account';
    case 'youtube':
      return 'YouTube';
    default: {
      const _exhaustive: never = bundle;
      return _exhaustive;
    }
  }
}

export function ConnectorsClient({
  providers,
  suggestedActions,
  isDev,
}: ConnectorsClientProps) {
  const router = useRouter();
  const [isPendingExtract, startExtract] = useTransition();
  const groups = groupByBundle(providers);

  const handleConnect = (bundle: ConnectorOAuthBundle) => {
    router.push(
      `${AUTHORIZE_PATH[bundle]}?returnTo=${encodeURIComponent(APP_ROUTES.SETTINGS_CONNECTORS)}`
    );
  };

  const handleDisconnect = async (bundle: ConnectorOAuthBundle) => {
    try {
      const res = await fetch(DISCONNECT_PATH[bundle], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Disconnect failed');
      toast.success(
        bundle === 'youtube'
          ? 'YouTube disconnected'
          : 'Google connectors disconnected'
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

  const isGoogleConnected = providers.some(
    p =>
      p.oauthBundle === 'google' &&
      (p.status === 'connected' || p.status === 'syncing')
  );

  return (
    <SettingsSection
      id='connectors'
      title='Connections'
      description='Connect external accounts for booking detection, calendar sync, and approved YouTube thumbnail changes.'
    >
      {groups.map(group => (
        <SettingsPanel key={group.bundle} title={bundleTitle(group.bundle)}>
          <div className='divide-y divide-subtle'>
            {group.items.map(item => (
              <ConnectorCard
                key={item.provider}
                provider={item.provider}
                status={item.status}
                email={item.accountLabel}
                errorMessage={item.errorMessage}
                scopes={item.scopes}
                onConnect={() => handleConnect(group.bundle)}
                onDisconnect={() => handleDisconnect(group.bundle)}
              />
            ))}
          </div>
        </SettingsPanel>
      ))}

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
