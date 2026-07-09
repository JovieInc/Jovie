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
  readonly gmail: ConnectorState;
  readonly calendar: ConnectorState;
  readonly suggestedActions: SuggestedActionPreview[];
  readonly isDev: boolean;
}

export function ConnectorsClient({
  gmail,
  calendar,
  suggestedActions,
  isDev,
}: ConnectorsClientProps) {
  const router = useRouter();
  const [isPendingExtract, startExtract] = useTransition();

  const handleConnect = () => {
    router.push(
      `/api/connectors/google/authorize?returnTo=${encodeURIComponent(APP_ROUTES.SETTINGS_CONNECTORS)}`
    );
  };

  const handleDisconnect = async () => {
    try {
      const res = await fetch('/api/connectors/google/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Disconnect failed');
      toast.success('Google connectors disconnected');
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
      title='Connectors'
      description='Connect Gmail and Google Calendar to automatically detect booking confirmations.'
    >
      <SettingsPanel title='Google Account'>
        <div className='divide-y divide-subtle'>
          <ConnectorCard
            provider='gmail'
            status={gmail.status}
            email={gmail.email}
            errorMessage={gmail.errorMessage}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />
          <ConnectorCard
            provider='google_calendar'
            status={calendar.status}
            email={calendar.email}
            errorMessage={calendar.errorMessage}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />
        </div>
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
