'use client';

import { Badge, Button, Input, Switch } from '@jovie/ui';
import { CheckCircle2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { APP_ROUTES } from '@/constants/routes';
import { useUserSafe } from '@/hooks/useClerkSafe';
import {
  REQUIRED_PLAYLIST_SPOTIFY_SCOPES,
  SPOTIFY_OAUTH_TOKEN_STRATEGY,
} from '@/lib/spotify/system-account';
import {
  generateTestPlaylist,
  setCurrentAdminAsPlaylistSpotifyPublisher,
  updatePlaylistEngineSettings,
} from './actions';

const INTERVAL_UNITS = ['hours', 'days', 'weeks'] as const;

type IntervalUnit = (typeof INTERVAL_UNITS)[number];

interface SpotifyStatus {
  readonly connected: boolean;
  readonly healthy: boolean;
  readonly source: 'database' | 'env fallback' | 'missing';
  readonly clerkUserId: string | null;
  readonly accountLabel: string | null;
  readonly approvedScopes: string[];
  readonly missingScopes: string[];
  readonly updatedAt: string | null;
  readonly error: string | null;
}

interface EngineSettings {
  readonly enabled: boolean;
  readonly intervalValue: number;
  readonly intervalUnit: IntervalUnit;
  readonly lastGeneratedAt: string | null;
  readonly nextEligibleAt: string | null;
}

interface PlatformConnectionsClientProps {
  readonly currentTab: 'spotify' | 'engine';
  readonly spotifyStatus: SpotifyStatus;
  readonly engineSettings: EngineSettings;
  readonly currentUser: {
    readonly hasSpotify: boolean;
    readonly label: string | null;
    readonly missingScopes: readonly string[];
  };
}

function formatDate(value: string | null): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function StatusBadge({ ok, label }: Readonly<{ ok: boolean; label: string }>) {
  return (
    <Badge variant={ok ? 'success' : 'secondary'} size='sm' className='gap-1'>
      {ok ? <CheckCircle2 className='size-3.5' aria-hidden /> : null}
      {label}
    </Badge>
  );
}

function ResultMessage({
  result,
}: Readonly<{ result: { success: boolean; message: string } | null }>) {
  if (!result) return null;
  return (
    <p
      className={
        result.success ? 'text-xs text-emerald-300' : 'text-xs text-red-300'
      }
    >
      {result.message}
    </p>
  );
}

export function PlatformConnectionsClient({
  currentTab,
  spotifyStatus,
  engineSettings,
  currentUser,
}: PlatformConnectionsClientProps) {
  if (currentTab === 'spotify') {
    return (
      <SpotifyTabContent
        spotifyStatus={spotifyStatus}
        currentUser={currentUser}
      />
    );
  }

  return (
    <EngineTabContent
      spotifyStatus={spotifyStatus}
      engineSettings={engineSettings}
    />
  );
}

function SpotifyTabContent({
  spotifyStatus,
  currentUser,
}: Readonly<{
  spotifyStatus: SpotifyStatus;
  currentUser: PlatformConnectionsClientProps['currentUser'];
}>) {
  const router = useRouter();
  const { user } = useUserSafe();
  const [isPending, startTransition] = useTransition();
  const [isConnecting, setIsConnecting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  function refresh() {
    router.refresh();
  }

  async function connectSpotify() {
    if (!user) return;
    setResult(null);
    setIsConnecting(true);
    try {
      const redirectUrl = `${globalThis.location.origin}${APP_ROUTES.ADMIN_PLATFORM_CONNECTIONS}`;
      await user.createExternalAccount({
        strategy: SPOTIFY_OAUTH_TOKEN_STRATEGY,
        additionalScopes: [...REQUIRED_PLAYLIST_SPOTIFY_SCOPES],
        redirectUrl,
      });
    } catch (error) {
      setResult({
        success: false,
        message:
          error instanceof Error ? error.message : 'Failed to connect Spotify.',
      });
    } finally {
      setIsConnecting(false);
    }
  }

  function handleUseAccount() {
    setResult(null);
    startTransition(async () => {
      const response = await setCurrentAdminAsPlaylistSpotifyPublisher();
      setResult(response);
      if (response.success) refresh();
    });
  }

  const isBusy = isPending || isConnecting;
  let connectButtonLabel = 'Connect Spotify';
  if (isConnecting) connectButtonLabel = 'Connecting';
  else if (currentUser.hasSpotify) connectButtonLabel = 'Reconnect Spotify';

  return (
    <div className='divide-y divide-(--linear-app-frame-seam) rounded-[8px] border border-(--linear-app-frame-seam) bg-surface-1'>
      <div className='flex flex-wrap items-center justify-between gap-3 px-4 py-3'>
        <div className='flex min-w-0 flex-wrap items-center gap-2'>
          <StatusBadge
            ok={spotifyStatus.connected}
            label={spotifyStatus.connected ? 'Connected' : 'Disconnected'}
          />
          <StatusBadge
            ok={spotifyStatus.healthy}
            label={spotifyStatus.healthy ? 'Healthy' : 'Needs attention'}
          />
          <Badge variant='secondary' size='sm'>
            Source: {spotifyStatus.source}
          </Badge>
        </div>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          onClick={refresh}
          className='h-8 gap-2'
        >
          <RefreshCw className='size-4' aria-hidden />
          Refresh Status
        </Button>
      </div>

      <div className='grid gap-3 px-4 py-4 text-app sm:grid-cols-2'>
        <div>
          <p className='font-[510] text-primary-token'>Active Publisher</p>
          <p className='mt-1 text-secondary-token'>
            {spotifyStatus.accountLabel ??
              spotifyStatus.clerkUserId ??
              'Not set'}
          </p>
          <p className='mt-1 text-xs text-tertiary-token'>
            {spotifyStatus.updatedAt
              ? `Updated ${formatDate(spotifyStatus.updatedAt)}`
              : 'Never updated'}
          </p>
        </div>
        <div>
          <p className='font-[510] text-primary-token'>Current Admin Account</p>
          <p className='mt-1 text-secondary-token'>
            {currentUser.hasSpotify
              ? (currentUser.label ?? 'Spotify connected')
              : 'Spotify is not connected'}
          </p>
          {currentUser.missingScopes.length > 0 ? (
            <p className='mt-1 text-xs text-red-300'>
              Missing scopes: {currentUser.missingScopes.join(', ')}
            </p>
          ) : null}
        </div>
      </div>

      {spotifyStatus.error ? (
        <div className='px-4 py-3 text-xs text-red-300'>
          {spotifyStatus.error}
        </div>
      ) : null}

      <div className='flex flex-wrap items-center gap-2 px-4 py-3'>
        <Button
          type='button'
          size='sm'
          variant='secondary'
          onClick={() => {
            void connectSpotify();
          }}
          disabled={isBusy}
        >
          {connectButtonLabel}
        </Button>
        <Button
          type='button'
          size='sm'
          onClick={handleUseAccount}
          disabled={
            !currentUser.hasSpotify ||
            currentUser.missingScopes.length > 0 ||
            isBusy
          }
          className='gap-2'
        >
          {isBusy ? (
            <Loader2 className='size-4 animate-spin' aria-hidden />
          ) : (
            <ShieldCheck className='size-4' aria-hidden />
          )}
          Use This Account
        </Button>
        <ResultMessage result={result} />
      </div>
    </div>
  );
}

function EngineTabContent({
  spotifyStatus,
  engineSettings,
}: Readonly<{
  spotifyStatus: SpotifyStatus;
  engineSettings: EngineSettings;
}>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [enabled, setEnabled] = useState(engineSettings.enabled);
  const [intervalValue, setIntervalValue] = useState(
    String(engineSettings.intervalValue)
  );
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>(
    engineSettings.intervalUnit
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    setEnabled(engineSettings.enabled);
    setIntervalValue(String(engineSettings.intervalValue));
    setIntervalUnit(engineSettings.intervalUnit);
  }, [
    engineSettings.enabled,
    engineSettings.intervalValue,
    engineSettings.intervalUnit,
  ]);

  function refresh() {
    router.refresh();
  }

  function handleSaveEngine() {
    setResult(null);
    startTransition(async () => {
      const response = await updatePlaylistEngineSettings({
        enabled,
        intervalValue: Number.parseInt(intervalValue, 10),
        intervalUnit,
      });
      setResult(response);
      if (response.success) refresh();
    });
  }

  function handleGenerate() {
    setResult(null);
    setIsGenerating(true);
    startTransition(async () => {
      try {
        const response = await generateTestPlaylist();
        setResult(response);
        if (response.success) refresh();
      } catch (error) {
        setResult({
          success: false,
          message:
            error instanceof Error
              ? error.message
              : 'Test playlist generation failed.',
        });
      } finally {
        setIsGenerating(false);
      }
    });
  }

  const isBusy = isPending || isGenerating;
  const publisherNote = spotifyStatus.accountLabel
    ? ` Publisher: ${spotifyStatus.accountLabel}.`
    : '';

  return (
    <>
      <div className='divide-y divide-(--linear-app-frame-seam) rounded-[8px] border border-(--linear-app-frame-seam) bg-surface-1'>
        <div className='flex flex-wrap items-center justify-between gap-3 px-4 py-3'>
          <div className='flex min-w-0 flex-wrap items-center gap-2'>
            <StatusBadge
              ok={enabled}
              label={enabled ? 'Enabled' : 'Disabled'}
            />
            <Badge variant='secondary' size='sm'>
              Minimum interval
            </Badge>
          </div>
          <Button type='button' variant='ghost' size='sm' onClick={refresh}>
            Refresh Status
          </Button>
        </div>

        <div className='grid gap-4 px-4 py-4 sm:grid-cols-[1fr_1.2fr]'>
          <div className='flex items-center gap-3 text-app text-primary-token'>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-labelledby='playlist-engine-toggle-label'
            />
            <span id='playlist-engine-toggle-label'>Playlist Engine</span>
          </div>

          <div className='flex flex-wrap items-center gap-2 text-app'>
            <label
              htmlFor='playlist-generation-interval-value'
              className='text-secondary-token'
            >
              Eligible every
            </label>
            <Input
              id='playlist-generation-interval-value'
              type='number'
              min={1}
              value={intervalValue}
              onChange={event => setIntervalValue(event.target.value)}
              className='h-8 w-20'
            />
            <select
              id='playlist-generation-interval-unit'
              value={intervalUnit}
              onChange={event =>
                setIntervalUnit(event.target.value as IntervalUnit)
              }
              aria-label='Playlist generation interval unit'
              className='h-8 rounded-md border border-(--linear-app-frame-seam) bg-surface-0 px-2 text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token focus-visible:ring-offset-2'
            >
              {INTERVAL_UNITS.map(unit => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className='grid gap-3 px-4 py-4 text-app sm:grid-cols-2'>
          <div>
            <p className='font-[510] text-primary-token'>Last Generated</p>
            <p className='mt-1 text-secondary-token'>
              {formatDate(engineSettings.lastGeneratedAt)}
            </p>
          </div>
          <div>
            <p className='font-[510] text-primary-token'>Next Eligible</p>
            <p className='mt-1 text-secondary-token'>
              {formatDate(engineSettings.nextEligibleAt)}
            </p>
          </div>
        </div>

        <div className='flex flex-wrap items-center gap-2 px-4 py-3'>
          <Button
            type='button'
            size='sm'
            onClick={handleSaveEngine}
            disabled={isBusy}
          >
            Save Settings
          </Button>
          <Button
            type='button'
            size='sm'
            variant='secondary'
            onClick={() => setConfirmOpen(true)}
            disabled={!spotifyStatus.healthy || isBusy}
          >
            {isGenerating ? 'Generating' : 'Generate Test Playlist'}
          </Button>
          <ResultMessage result={result} />
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title='Generate Test Playlist?'
        description={`This runs playlist discovery now and creates a pending playlist for review. It will not publish to Spotify.${publisherNote}`}
        confirmLabel='Generate'
        cancelLabel='Cancel'
        onConfirm={handleGenerate}
      />
    </>
  );
}
