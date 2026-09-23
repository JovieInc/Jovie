'use client';

import { Button, type CommonDropdownItem, SimpleTooltip } from '@jovie/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownRight,
  ArrowUpRight,
  AudioWaveform,
  BookOpen,
  Cable,
  Circle,
  CircleAlert,
  CircleCheck,
  CircleX,
  ExternalLink,
  Globe2,
  MoreHorizontal,
  Orbit,
  Plus,
  RefreshCw,
  Share2,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ProfileSuggestion } from '@/app/api/suggestions/route';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { EmptyCell } from '@/components/atoms/EmptyCell';
import {
  getPlatformIconMetadata,
  SocialIcon,
} from '@/components/atoms/SocialIcon';
import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import { DashboardHeaderActionButton } from '@/components/features/dashboard/atoms/DashboardHeaderActionButton';
import { DashboardHeaderActionGroup } from '@/components/features/dashboard/atoms/DashboardHeaderActionGroup';
import {
  DrawerAnalyticsSummaryCard,
  DrawerSection,
  EntityHeaderCard,
  EntitySidebarShell,
  ShareableLinkRow,
} from '@/components/molecules/drawer';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { EmptyState } from '@/components/molecules/EmptyState';
import { PageShell } from '@/components/organisms/PageShell';
import {
  type ContextMenuItemType,
  convertContextMenuItems,
  convertToCommonDropdownItems,
  PageToolbar,
  PageToolbarTabButton,
  TableEmptyState,
  UnifiedTable,
} from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import { useRegisterHeaderActions } from '@/contexts/HeaderActionsContext';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import {
  getPresenceEntityName,
  getPresenceHandle,
  getPresencePlatformLabel,
} from '@/lib/profile-surfaces/presence-identity';
import {
  filterProfileWorkspaceRows,
  formatProfileRankChange,
  getConnectionPrimaryAction,
  getConnectionStatus,
  getPresenceSignals,
  type PresenceSignal,
  selectPresenceReviewRows,
  sortProfileWorkspaceRows,
} from '@/lib/profile-surfaces/workspace';
import {
  FetchError,
  fetchWithTimeout,
  queryKeys,
  STANDARD_CACHE,
} from '@/lib/queries';
import { type ColumnDef, createColumnHelper } from '@/lib/tanstack-table';
import { cn } from '@/lib/utils';
import {
  AddConnectionRail,
  type ConnectionIntakeCandidate,
} from './AddConnectionRail';
import { buildConnectionActions } from './connection-actions';
import type {
  ProfilesWorkspaceData,
  ProfilesWorkspaceFilter,
  ProfileWorkspaceRow,
  ProfileWorkspaceSurfaceRow,
} from './data';
import { PresenceIdentityPhoto } from './PresenceIdentityPhoto';
import { PresenceLockAffordance } from './PresenceLockAffordance';
import {
  PresenceOutcomeStrip as PresenceOutcomeBoard,
  presenceFilterForGroup,
} from './PresenceOutcomes';
import styles from './profiles-workspace.module.css';

const columnHelper = createColumnHelper<ProfileWorkspaceRow>();
type ProfilesWorkspaceView = ProfilesWorkspaceFilter | 'suggested' | 'review';
const FILTERS: ReadonlyArray<{
  readonly id: ProfilesWorkspaceView;
  readonly label: string;
}> = [
  { id: 'review', label: 'Review Pages' },
  { id: 'all', label: 'All Pages' },
  { id: 'identity', label: 'Identity' },
  { id: 'profiles', label: 'Profiles' },
  { id: 'catalog', label: 'Catalog' },
  { id: 'suggested', label: 'Suggested' },
  { id: 'connector', label: 'Connectors' },
];

type ConnectionSuggestion = ProfileSuggestion & {
  readonly type: 'dsp_match' | 'social_link';
  readonly externalUrl: string;
};

interface SuggestionActionError {
  readonly suggestionId: string;
  readonly message: string;
}

interface SuggestedConnectionGroup {
  readonly id: string;
  readonly identity: string;
  readonly suggestions: readonly ConnectionSuggestion[];
}

interface SuggestionsApiResponse {
  readonly success: boolean;
  readonly suggestions?: ProfileSuggestion[];
  readonly error?: string;
}

interface SuggestionMutationResponse {
  readonly success?: boolean;
  readonly error?: string;
}

type SuggestionAction = 'accept' | 'reject';

const CONNECTION_SUGGESTION_PLATFORM_PRIORITY: Readonly<
  Record<string, number>
> = {
  instagram: 0,
  tiktok: 1,
  youtube: 2,
  twitter: 3,
  x: 3,
  facebook: 4,
  spotify: 10,
  apple_music: 11,
  youtube_music: 12,
  soundcloud: 13,
  bandcamp: 14,
};

const SUGGESTED_QUEUE_FOCUS_TARGET = 'suggested-connections-region';
const SUGGESTED_CONNECTION_SKELETON_IDS = [
  'suggested-connection-loading-1',
  'suggested-connection-loading-2',
  'suggested-connection-loading-3',
] as const;

function connectionSuggestionsQueryKey(profileId: string) {
  return [...queryKeys.suggestions.list(profileId), 'connections-review'];
}

function isConnectionSuggestion(
  suggestion: ProfileSuggestion
): suggestion is ConnectionSuggestion {
  return (
    (suggestion.type === 'dsp_match' || suggestion.type === 'social_link') &&
    typeof suggestion.externalUrl === 'string' &&
    suggestion.externalUrl.trim().length > 0
  );
}

async function fetchConnectionSuggestions(
  profileId: string,
  signal?: AbortSignal
): Promise<ConnectionSuggestion[]> {
  const data = await fetchWithTimeout<SuggestionsApiResponse>(
    `/api/suggestions?profileId=${encodeURIComponent(profileId)}`,
    { signal }
  );

  if (!data.success) {
    throw new Error(data.error ?? 'Failed to load suggestions');
  }

  return (data.suggestions ?? []).filter(isConnectionSuggestion);
}

function compactUrlDisplay(value: string): string {
  try {
    const url = new URL(value);
    const path = url.pathname
      .split('/')
      .findLast(segment => segment.length > 0)
      ?.replace(/^@/, '');
    if (path) return `@${path}`;
    return url.hostname.replace(/^www\./, '');
  } catch {
    return value;
  }
}

function suggestionIdentity(suggestion: ConnectionSuggestion): string {
  const title = suggestion.title.trim();
  if (title) return title;
  if (suggestion.externalUrl) return compactUrlDisplay(suggestion.externalUrl);
  return suggestion.platformLabel;
}

function suggestionIdentityKey(suggestion: ConnectionSuggestion): string {
  return suggestionIdentity(suggestion).trim().toLowerCase().replace(/^@/, '');
}

function formatConfidence(confidence: number | null): string | null {
  if (confidence === null) return null;
  return `${Math.round(confidence * 100)}% match`;
}

function suggestionContext(suggestion: ConnectionSuggestion): string {
  const confidence = formatConfidence(suggestion.confidence);
  return [suggestion.subtitle, confidence].filter(Boolean).join(' · ');
}

function sortConnectionSuggestions(
  suggestions: readonly ConnectionSuggestion[]
): ConnectionSuggestion[] {
  return [...suggestions].sort((left, right) => {
    const identityDifference = suggestionIdentityKey(left).localeCompare(
      suggestionIdentityKey(right)
    );
    if (identityDifference !== 0) return identityDifference;

    const platformDifference =
      (CONNECTION_SUGGESTION_PLATFORM_PRIORITY[left.platform] ?? 50) -
      (CONNECTION_SUGGESTION_PLATFORM_PRIORITY[right.platform] ?? 50);
    if (platformDifference !== 0) return platformDifference;

    return (right.confidence ?? 0) - (left.confidence ?? 0);
  });
}

function groupConnectionSuggestions(
  suggestions: readonly ConnectionSuggestion[]
): SuggestedConnectionGroup[] {
  const groups = new Map<string, SuggestedConnectionGroup>();

  for (const suggestion of sortConnectionSuggestions(suggestions)) {
    const identity = suggestionIdentity(suggestion);
    const id = suggestionIdentityKey(suggestion) || suggestion.id;
    const existing = groups.get(id);
    groups.set(id, {
      id,
      identity,
      suggestions: existing
        ? [...existing.suggestions, suggestion]
        : [suggestion],
    });
  }

  return [...groups.values()];
}

function suggestionActionEndpoint(
  suggestion: ConnectionSuggestion,
  action: SuggestionAction
): string {
  if (suggestion.type === 'dsp_match') {
    return `/api/dsp/matches/${encodeURIComponent(suggestion.id)}/${
      action === 'accept' ? 'confirm' : 'reject'
    }`;
  }

  return `/api/suggestions/social-links/${encodeURIComponent(suggestion.id)}/${
    action === 'accept' ? 'approve' : 'reject'
  }`;
}

function suggestionFocusKey(
  suggestionId: string,
  action: SuggestionAction
): string {
  return `${suggestionId}:${action}`;
}

function findNextSuggestionFocusTarget(
  suggestions: readonly ConnectionSuggestion[],
  suggestionId: string
): string {
  const index = suggestions.findIndex(
    suggestion => suggestion.id === suggestionId
  );
  const nextSuggestion = suggestions[index + 1] ?? suggestions[index - 1];
  return nextSuggestion
    ? suggestionFocusKey(nextSuggestion.id, 'accept')
    : SUGGESTED_QUEUE_FOCUS_TARGET;
}

function suggestionToAcceptedRow(
  suggestion: ConnectionSuggestion
): ProfileWorkspaceSurfaceRow {
  return {
    id: `accepted:${suggestion.type}:${suggestion.id}`,
    rowType: 'surface',
    kind: suggestion.type === 'dsp_match' ? 'dsp' : 'social',
    platform: suggestion.platform,
    label: suggestion.platformLabel || suggestion.platform,
    handle:
      suggestion.type === 'social_link' ? suggestionIdentity(suggestion) : null,
    url: suggestion.externalUrl,
    trackedUrl: null,
    qualificationStatus: 'qualified',
    isOfficial: true,
    monitoringState: 'unavailable',
    rank: null,
    previousRank: null,
    lastObservedAt: null,
  };
}

function kindLabel(row: ProfileWorkspaceRow): string {
  const labels = {
    jovie: 'Jovie',
    website: 'Website',
    social: 'Social',
    dsp: 'DSP',
    authority: 'Source',
    connector: 'Connector',
  } as const;
  return labels[row.kind];
}

function ConnectionTypeGlyph({
  row,
  className,
}: Readonly<{
  row: ProfileWorkspaceRow;
  className?: string;
}>) {
  const iconClassName = cn('h-4 w-4', className);
  if (row.kind === 'connector')
    return <Cable className={iconClassName} aria-hidden />;
  if (row.kind === 'website')
    return <Globe2 className={iconClassName} aria-hidden />;
  if (row.kind === 'authority')
    return <BookOpen className={iconClassName} aria-hidden />;
  if (row.kind === 'dsp')
    return <AudioWaveform className={iconClassName} aria-hidden />;
  if (row.kind === 'social')
    return <Share2 className={iconClassName} aria-hidden />;
  return <Orbit className={iconClassName} aria-hidden />;
}

function ConnectionBrandIcon({
  row,
  className,
  emphasized = false,
}: Readonly<{
  row: ProfileWorkspaceRow;
  className?: string;
  emphasized?: boolean;
}>) {
  if (row.rowType === 'connector')
    return (
      <ConnectionTypeGlyph
        row={row}
        className={cn('text-tertiary-token', className)}
      />
    );
  if (row.kind === 'authority' || row.kind === 'website') {
    return (
      <ConnectionTypeGlyph
        row={row}
        className={cn('text-tertiary-token', className)}
      />
    );
  }
  if (row.kind === 'jovie') {
    return (
      <BrandLogo
        size='chrome'
        tone='color'
        rounded={false}
        aria-hidden
        className={cn('[&_svg]:h-full [&_svg]:w-full', className)}
      />
    );
  }
  const metadata = getPlatformIconMetadata(row.platform);
  if (!metadata) {
    return (
      <span
        className={cn('inline-flex shrink-0 text-tertiary-token', className)}
        aria-label={row.label}
        role='img'
      >
        <SocialIcon platform={row.platform} className='h-full w-full' />
      </span>
    );
  }

  const revealClassName = emphasized
    ? 'absolute inset-0 opacity-100'
    : 'absolute inset-0 opacity-0 transition-opacity duration-fast motion-reduce:transition-none group-hover/connection-row:opacity-100 group-focus-visible/connection-row:opacity-100 group-aria-[selected=true]/connection-row:opacity-100';

  return (
    <span
      className={cn('relative inline-flex h-4 w-4 shrink-0', className)}
      aria-label={row.label}
      role='img'
    >
      <SocialIcon
        platform={row.platform}
        className='h-full w-full text-primary-token opacity-70'
      />
      <span
        className={revealClassName}
        style={{ color: `#${metadata.hex}` }}
        aria-hidden
      >
        <SocialIcon platform={row.platform} className='h-full w-full' />
      </span>
    </span>
  );
}

function connectionDisplayUrl(row: ProfileWorkspaceRow): string {
  return row.rowType === 'surface' && row.kind === 'social'
    ? (row.trackedUrl ?? row.url)
    : row.url;
}

function connectionUrlDisplay(row: ProfileWorkspaceRow): string {
  const displayUrl = connectionDisplayUrl(row);
  if (row.handle && displayUrl === row.url) return row.handle;
  try {
    const url = new URL(displayUrl);
    const host = url.hostname.replace(/^www\./, '');
    const path = url.pathname.replace(/^\/+|\/+$/g, '');
    if (!path) return host;
    try {
      return `${host} · ${decodeURIComponent(path)}`;
    } catch {
      return `${host} · ${path}`;
    }
  } catch {
    return displayUrl;
  }
}

function ConnectionUrlDisplay({
  row,
  className,
}: Readonly<{ row: ProfileWorkspaceRow; className?: string }>) {
  const displayUrl = connectionDisplayUrl(row);
  return (
    <span className={cn('truncate', className)} title={displayUrl}>
      {connectionUrlDisplay(row)}
    </span>
  );
}

function TypeCell({ row }: Readonly<{ row: ProfileWorkspaceRow }>) {
  const label = kindLabel(row);
  return (
    <SimpleTooltip content={`${label} profile type`}>
      <span
        role='img'
        aria-label={`${label} profile type`}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center',
          row.kind === 'jovie' ? 'text-accent' : 'text-tertiary-token'
        )}
      >
        <ConnectionTypeGlyph row={row} />
      </span>
    </SimpleTooltip>
  );
}

function StatusCell({
  row,
  providerAvailable,
}: Readonly<{ row: ProfileWorkspaceRow; providerAvailable: boolean }>) {
  const status = getConnectionStatus(row, providerAvailable);
  const StatusIcon =
    status.tone === 'success'
      ? CircleCheck
      : status.tone === 'warning'
        ? CircleAlert
        : status.tone === 'error'
          ? CircleX
          : Circle;
  return (
    <SimpleTooltip
      content={
        <span>
          <strong className='block'>{status.label}</strong>
          <span>{status.nextAction}</span>
        </span>
      }
    >
      <span
        className={cn(
          'inline-flex min-h-7 items-center gap-1.5 text-xs text-tertiary-token',
          status.tone === 'success' && 'text-success',
          status.tone === 'warning' && 'text-warning',
          status.tone === 'error' && 'text-error'
        )}
      >
        <StatusIcon className='h-3.5 w-3.5 shrink-0' aria-hidden />
        <span className='min-w-0 whitespace-normal'>{status.label}</span>
      </span>
    </SimpleTooltip>
  );
}

const MONITORING_LABELS = {
  active: 'Active',
  paused: 'Paused',
  locked: 'Restricted',
  unavailable: 'Unavailable',
} as const;

function MonitoringCell({ row }: Readonly<{ row: ProfileWorkspaceRow }>) {
  const monitoringState = row.monitoringState;
  if (monitoringState === 'locked') {
    return <PresenceLockAffordance />;
  }
  return (
    <span className='inline-flex min-w-20 items-center gap-1.5 text-xs text-secondary-token'>
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          monitoringState === 'active' && 'bg-success',
          monitoringState === 'paused' && 'bg-warning',
          monitoringState === 'unavailable' && 'bg-disabled'
        )}
        aria-hidden
      />
      {MONITORING_LABELS[monitoringState]}
    </span>
  );
}

function RankCell({ row }: Readonly<{ row: ProfileWorkspaceRow }>) {
  if (row.rowType === 'connector') {
    return <EmptyCell tooltip='Search rank is not available for connectors.' />;
  }
  if (row.monitoringState === 'locked') {
    return <PresenceLockAffordance />;
  }
  if (row.rank === null) {
    return <EmptyCell tooltip='No rank has been measured yet.' />;
  }
  return <span className='tabular-nums'>{row.rank}</span>;
}

function ConnectionRail({
  data,
  row,
  onClose,
  contextMenuItems,
}: Readonly<{
  data: ProfilesWorkspaceData;
  row: ProfileWorkspaceRow | null;
  onClose: () => void;
  contextMenuItems: CommonDropdownItem[];
}>) {
  const primaryAction = row ? getConnectionPrimaryAction(row) : null;
  const rankChange =
    row?.rowType === 'surface'
      ? formatProfileRankChange(row.rank, row.previousRank)
      : '—';
  return (
    <EntitySidebarShell
      isOpen={row !== null}
      ariaLabel='Presence details'
      onClose={onClose}
      contextMenuItems={contextMenuItems}
      scrollStrategy='shell'
      workspaceSurface='raised'
      headerMode='minimal'
      hideMinimalHeaderBar
      isEmpty={!row}
      emptyMessage='Select a profile or page to view details.'
      entityHeader={
        row ? (
          <EntityHeaderCard
            image={
              row.rowType === 'connector' ? (
                <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-subtle bg-surface-0'>
                  <ConnectionBrandIcon
                    row={row}
                    className='h-6 w-6'
                    emphasized
                  />
                </div>
              ) : (
                <PresenceIdentityPhoto
                  subject={row}
                  artistName={data.artist.name}
                  size='xl'
                  showSource
                />
              )
            }
            title={getPresenceEntityName(row, data.artist.name)}
            subtitle={[getPresencePlatformLabel(row), getPresenceHandle(row)]
              .filter(Boolean)
              .join(' · ')}
            meta={
              <ShareableLinkRow
                url={
                  row.rowType === 'surface' && row.kind === 'social'
                    ? (row.trackedUrl ?? row.url)
                    : row.url
                }
                density='rail'
                testId='profiles-rail-shareable-link'
              />
            }
            stableLayout
            titleLineClamp={1}
            subtitleLineClamp={1}
            reserveSubtitleSlot
            reserveMetaSlot
            metaOverflow='scroll'
            actions={
              <DrawerHeaderActions
                primaryActions={[]}
                overflowActions={[]}
                menuItems={contextMenuItems}
                onClose={onClose}
              />
            }
            bodyClassName='pr-8'
            data-testid='profiles-rail-entity-header'
          />
        ) : undefined
      }
    >
      {row ? (
        <div className='space-y-2'>
          <DrawerAnalyticsSummaryCard
            state='ready'
            metrics={[
              {
                id: 'status',
                label: 'Status',
                value: getConnectionStatus(row, data?.providerAvailable).label,
                hint: MONITORING_LABELS[row.monitoringState],
              },
              {
                id: 'rank',
                label: 'Search Rank',
                value:
                  row.rowType === 'surface' && row.monitoringState !== 'locked'
                    ? String(row.rank ?? '—')
                    : '—',
                hint: rankChange === '—' ? 'No change yet' : rankChange,
              },
            ]}
            footer={null}
            stableLayout
            reserveFooterSlot={false}
            testId='profiles-rail-summary'
          />
          <DrawerSection title='Profile / Page' sectionKind='facts'>
            <div className='space-y-2'>
              <RailMetric label='Type' value={kindLabel(row)} />
              <RailMetric
                label='Monitoring'
                value={MONITORING_LABELS[row.monitoringState]}
              />
            </div>
          </DrawerSection>
          <PresenceSignalSection
            row={row}
            providerAvailable={data.providerAvailable}
          />
          <DrawerSection sectionKind='details'>
            <div
              className={cn(
                'grid gap-2 px-1',
                primaryAction === 'open' ||
                  (primaryAction === 'review' && row.rowType === 'surface')
                  ? 'grid-cols-1'
                  : 'grid-cols-2'
              )}
            >
              <Button asChild variant='secondary' size='sm'>
                <Link
                  href={row.url}
                  target={row.url.startsWith('http') ? '_blank' : undefined}
                  rel={row.url.startsWith('http') ? 'noreferrer' : undefined}
                >
                  <ExternalLink className='h-3.5 w-3.5' />{' '}
                  {primaryAction === 'review' && row.rowType === 'surface'
                    ? 'Inspect Source'
                    : 'Open'}
                </Link>
              </Button>
              {primaryAction !== 'open' &&
              !(primaryAction === 'review' && row.rowType === 'surface') ? (
                <Button asChild size='sm'>
                  <Link
                    href={
                      primaryAction === 'upgrade'
                        ? APP_ROUTES.SETTINGS_BILLING
                        : row.rowType === 'connector'
                          ? APP_ROUTES.SETTINGS_CONNECTORS
                          : APP_ROUTES.SETTINGS_ARTIST_PROFILE
                    }
                  >
                    {primaryAction === 'upgrade'
                      ? 'Upgrade'
                      : primaryAction === 'connect'
                        ? 'Connect'
                        : primaryAction === 'reconnect'
                          ? 'Reconnect'
                          : 'Review'}
                  </Link>
                </Button>
              ) : null}
            </div>
          </DrawerSection>
        </div>
      ) : null}
    </EntitySidebarShell>
  );
}

function RailMetric({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  return (
    <div className='flex items-center justify-between text-xs'>
      <span className='text-tertiary-token'>{label}</span>
      <span className='max-w-36 truncate text-primary-token'>{value}</span>
    </div>
  );
}

const SIGNAL_LABELS: Readonly<Record<PresenceSignal['kind'], string>> = {
  blocker: 'Blocker',
  finding: 'Finding',
  recommendation: 'Recommendation',
  state: 'State',
};

/**
 * JOV-6170: one opportunity = one identity. Canonical directory sources
 * (Genius / Last.fm / MusicBrainz) are quiet drill-in links so the artist
 * can complete the canonical profile from the same review, without Jovie
 * fabricating matches it has not detected.
 */
const CANONICAL_SOURCE_DRILLS: ReadonlyArray<{
  readonly label: string;
  readonly searchPath: string;
}> = [
  { label: 'Genius', searchPath: 'https://genius.com/search?q=' },
  // ui-casing-allow: canonical directory brand lockup
  { label: 'Last.fm', searchPath: 'https://www.last.fm/search?q=' },
  {
    // ui-casing-allow: canonical directory brand lockup
    label: 'MusicBrainz',
    searchPath: 'https://musicbrainz.org/search?type=artist&query=',
  },
];

function CanonicalSourceDrills({ identity }: Readonly<{ identity: string }>) {
  const query = encodeURIComponent(identity);
  return (
    <div className='flex items-center gap-3 border-b border-subtle px-3 py-1.5'>
      <span className='text-2xs text-tertiary-token'>Find on</span>
      {CANONICAL_SOURCE_DRILLS.map(source => (
        <a
          key={source.label}
          href={`${source.searchPath}${query}`}
          target='_blank'
          rel='noreferrer'
          data-testid='canonical-source-drill'
          className='inline-flex items-center gap-0.5 text-2xs text-secondary-token underline-offset-2 transition-colors duration-fast hover:text-primary-token hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus/50'
        >
          {source.label}
          <ExternalLink className='h-2.5 w-2.5' aria-hidden />
        </a>
      ))}
    </div>
  );
}

/**
 * JOV-6170: signals render as four SEPARATE primitives with distinct weight —
 * blockers loudest, state quiet — never merged into one undifferentiated feed.
 */
function PresenceSignalSection({
  row,
  providerAvailable,
}: Readonly<{ row: ProfileWorkspaceRow; providerAvailable: boolean }>) {
  const signals = getPresenceSignals(row, providerAvailable);
  return (
    <DrawerSection title='Signals' sectionKind='status'>
      <ul className='space-y-2' data-testid='presence-signal-list'>
        {signals.map(signal => (
          <li
            key={`${signal.kind}:${signal.label}`}
            className='text-xs leading-5'
            data-testid={`presence-signal-${signal.kind}`}
          >
            <span
              className={cn(
                'inline-flex items-center gap-1.5 font-medium',
                signal.tone === 'error' && 'text-error',
                signal.tone === 'warning' && 'text-warning',
                signal.tone === 'success' && 'text-success',
                signal.tone === 'neutral' && 'text-secondary-token'
              )}
            >
              {signal.tone === 'neutral' || signal.tone === 'success' ? (
                <Circle className='h-3 w-3' aria-hidden />
              ) : signal.tone === 'error' ? (
                <CircleX className='h-3 w-3' aria-hidden />
              ) : (
                <CircleAlert className='h-3 w-3' aria-hidden />
              )}
              <span className='sr-only'>{SIGNAL_LABELS[signal.kind]}:</span>
              {signal.label}
            </span>
            <span className='mt-0.5 block text-secondary-token'>
              {signal.detail}
            </span>
          </li>
        ))}
      </ul>
    </DrawerSection>
  );
}

function SuggestedConnectionsLoading() {
  return (
    <div aria-busy='true' aria-live='polite' className='min-h-55'>
      <span className='sr-only'>Loading Suggested Connections</span>
      <div className='overflow-hidden rounded-lg border border-subtle bg-surface-1'>
        {SUGGESTED_CONNECTION_SKELETON_IDS.map(id => (
          <div
            key={id}
            className='flex min-h-16 items-center gap-3 border-b border-subtle px-3 py-2.5 last:border-b-0'
          >
            <div className='h-8 w-8 shrink-0 rounded-md bg-surface-2' />
            <div className='min-w-0 flex-1 space-y-2'>
              <div className='h-3 w-28 rounded-full bg-surface-2' />
              <div className='h-3 w-44 max-w-full rounded-full bg-surface-2' />
            </div>
            <div className='hidden h-7 w-32 rounded-full bg-surface-2 sm:block' />
          </div>
        ))}
      </div>
      <span className='sr-only'>Loading suggested connections.</span>
    </div>
  );
}

function SuggestedConnectionsState({
  heading,
  description,
  onRetry,
  testId,
}: Readonly<{
  heading: string;
  description: string;
  onRetry?: () => void;
  testId: string;
}>) {
  return (
    <div className='min-h-55'>
      <TableEmptyState
        heading={heading}
        description={description}
        testId={testId}
        actionSlot={
          onRetry ? (
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={onRetry}
            >
              <RefreshCw className='h-3.5 w-3.5' aria-hidden /> Try Again
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}

function SuggestedConnectionRow({
  suggestion,
  actionError,
  onAction,
  registerActionRef,
}: Readonly<{
  suggestion: ConnectionSuggestion;
  actionError: SuggestionActionError | null;
  onAction: (
    suggestion: ConnectionSuggestion,
    action: SuggestionAction
  ) => void;
  registerActionRef: (
    suggestionId: string,
    action: SuggestionAction
  ) => (node: HTMLButtonElement | null) => void;
}>) {
  const hasError = actionError?.suggestionId === suggestion.id;
  const identity = suggestionIdentity(suggestion);
  const context = hasError
    ? actionError.message
    : suggestionContext(suggestion);

  return (
    <li
      data-testid='suggested-connection-row'
      className='flex min-h-16 min-w-0 items-center justify-between gap-2 px-3 py-2.5'
    >
      <div className='flex min-w-0 items-center gap-2.5'>
        <span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-subtle bg-surface-0 text-secondary-token'>
          <SocialIcon
            platform={suggestion.platform}
            className='h-4 w-4'
            aria-hidden
          />
        </span>
        <span className='min-w-0 flex-1'>
          <span className='flex min-w-0 items-center gap-2'>
            <span className='truncate text-sm font-medium text-primary-token'>
              {suggestion.platformLabel}
            </span>
            <span className='truncate text-xs text-secondary-token'>
              {identity}
            </span>
          </span>
          <span
            className={cn(
              'mt-0.5 block min-h-4 truncate text-xs',
              hasError ? 'text-error' : 'text-tertiary-token'
            )}
            role={hasError ? 'alert' : undefined}
          >
            {context}
          </span>
        </span>
      </div>
      <div className='grid grid-cols-2 gap-1.5 sm:flex sm:items-center sm:justify-end'>
        <Button
          ref={registerActionRef(suggestion.id, 'accept')}
          type='button'
          size='sm'
          className='w-full whitespace-nowrap sm:w-auto'
          onClick={() => onAction(suggestion, 'accept')}
        >
          <CircleCheck className='h-3.5 w-3.5' aria-hidden /> Add
        </Button>
        <Button
          ref={registerActionRef(suggestion.id, 'reject')}
          type='button'
          variant='secondary'
          size='sm'
          className='w-full whitespace-nowrap sm:w-auto'
          onClick={() => onAction(suggestion, 'reject')}
        >
          {/* ui-casing-allow: canonical sentence-case identity-rejection label, pinned by ProfilesWorkspace.test */}
          <CircleX className='h-3.5 w-3.5' aria-hidden /> Not me
        </Button>
      </div>
    </li>
  );
}

function SuggestedConnectionsReview({
  groups,
  isLoading,
  isError,
  actionError,
  onAction,
  onRetry,
  registerActionRef,
  regionRef,
}: Readonly<{
  groups: readonly SuggestedConnectionGroup[];
  isLoading: boolean;
  isError: boolean;
  actionError: SuggestionActionError | null;
  onAction: (
    suggestion: ConnectionSuggestion,
    action: SuggestionAction
  ) => void;
  onRetry: () => void;
  registerActionRef: (
    suggestionId: string,
    action: SuggestionAction
  ) => (node: HTMLButtonElement | null) => void;
  regionRef: RefObject<HTMLDivElement | null>;
}>) {
  return (
    <section
      ref={regionRef}
      tabIndex={-1}
      aria-label='Suggested Connections'
      className='min-h-55 min-w-0 px-3 py-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus/50'
      data-testid='suggested-connections-review'
    >
      {isLoading ? <SuggestedConnectionsLoading /> : null}
      {isError && groups.length === 0 ? (
        <SuggestedConnectionsState
          heading="Couldn't Load Suggestions"
          description='Suggestions could not be retrieved. Try again.'
          onRetry={onRetry}
          testId='suggested-connections-error-state'
        />
      ) : null}
      {!isLoading && !isError && groups.length === 0 ? (
        <SuggestedConnectionsState
          heading='No Suggested Connections'
          description='Detected public identities will appear here for review.'
          testId='suggested-connections-empty-state'
        />
      ) : null}
      {!isLoading && groups.length > 0 ? (
        <ul
          aria-label='Suggested Connection Review Queue'
          className='min-w-0 overflow-hidden rounded-lg border border-subtle bg-surface-1'
        >
          {groups.map(group => (
            <li
              key={group.id}
              data-testid='suggested-connection-group'
              data-suggestion-identity={group.id}
              className='min-w-0 border-b border-subtle last:border-b-0'
            >
              <div className='flex min-h-9 items-center justify-between gap-2 border-b border-subtle bg-surface-2 px-3'>
                <span className='truncate text-2xs font-medium text-secondary-token'>
                  Add canonical {group.identity} profile
                </span>
                <span
                  className='shrink-0 text-2xs text-tertiary-token'
                  data-testid='suggested-connection-group-count'
                >
                  Review {group.suggestions.length}
                </span>
              </div>
              <CanonicalSourceDrills identity={group.identity} />
              <ul
                aria-label={`${group.identity} suggestions`}
                className='min-w-0 divide-y divide-subtle'
              >
                {group.suggestions.map(suggestion => (
                  <SuggestedConnectionRow
                    key={suggestion.id}
                    suggestion={suggestion}
                    actionError={actionError}
                    onAction={onAction}
                    registerActionRef={registerActionRef}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function ProfilesWorkspace({
  data,
}: Readonly<{ data: ProfilesWorkspaceData | null }>) {
  const [filter, setFilter] = useState<ProfilesWorkspaceView>(() =>
    selectPresenceReviewRows(data?.rows ?? []).length > 0 ? 'review' : 'all'
  );
  const [selected, setSelected] = useState<ProfileWorkspaceRow | null>(null);
  const [isAddConnectionOpen, setIsAddConnectionOpen] = useState(false);
  const [pendingCandidate, setPendingCandidate] =
    useState<ConnectionIntakeCandidate | null>(null);
  const [suggestionActionError, setSuggestionActionError] =
    useState<SuggestionActionError | null>(null);
  const [acceptedSuggestionRows, setAcceptedSuggestionRows] = useState<
    ProfileWorkspaceSurfaceRow[]
  >([]);
  const suggestionActionRefs = useRef(new Map<string, HTMLButtonElement>());
  const suggestedRegionRef = useRef<HTMLDivElement>(null);
  const pendingSuggestionFocusTargetRef = useRef<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const profileId = data?.profileId ?? null;
  const connectionSuggestionKey = useMemo(
    () => connectionSuggestionsQueryKey(profileId ?? ''),
    [profileId]
  );
  const connectionSuggestionsQuery = useQuery({
    ...STANDARD_CACHE,
    queryKey: connectionSuggestionKey,
    queryFn: ({ signal }) =>
      fetchConnectionSuggestions(profileId ?? '', signal),
    enabled: Boolean(profileId),
    retry: (failureCount, error) =>
      failureCount < 2 &&
      (!(error instanceof FetchError) || error.isRetryable()),
  });
  const connectionSuggestions = useMemo(
    () => connectionSuggestionsQuery.data ?? [],
    [connectionSuggestionsQuery.data]
  );
  const suggestedGroups = useMemo(
    () => groupConnectionSuggestions(connectionSuggestions),
    [connectionSuggestions]
  );
  const visibleSuggestionFocusTargets = useMemo(
    () =>
      suggestedGroups
        .flatMap(group =>
          group.suggestions.flatMap(suggestion => [
            suggestionFocusKey(suggestion.id, 'accept'),
            suggestionFocusKey(suggestion.id, 'reject'),
          ])
        )
        .join('|'),
    [suggestedGroups]
  );
  useEffect(() => {
    if (searchParams.get('add') !== 'service') return;

    setSelected(null);
    setPendingCandidate(null);
    setIsAddConnectionOpen(false);
    setFilter('suggested');
    router.replace(APP_ROUTES.PROFILES);
  }, [router, searchParams]);
  useEffect(() => {
    const target = pendingSuggestionFocusTargetRef.current;
    if (!target) return;

    const element =
      target === SUGGESTED_QUEUE_FOCUS_TARGET
        ? suggestedRegionRef.current
        : suggestionActionRefs.current.get(target);
    if (!element) return;

    element.focus();
    pendingSuggestionFocusTargetRef.current = null;
  }, [visibleSuggestionFocusTargets]);
  const registerSuggestionActionRef = useCallback(
    (suggestionId: string, action: SuggestionAction) =>
      (node: HTMLButtonElement | null) => {
        const key = suggestionFocusKey(suggestionId, action);
        if (node) {
          suggestionActionRefs.current.set(key, node);
          return;
        }
        suggestionActionRefs.current.delete(key);
      },
    []
  );
  const persistedAcceptedRows = useMemo(() => {
    const currentSurfaceKeys = new Set(
      (data?.rows ?? [])
        .filter(row => row.rowType === 'surface')
        .map(row => `${row.platform}:${row.url}`)
    );

    return acceptedSuggestionRows.filter(
      row => !currentSurfaceKeys.has(`${row.platform}:${row.url}`)
    );
  }, [acceptedSuggestionRows, data?.rows]);
  const handleSuggestionAction = useCallback(
    async (suggestion: ConnectionSuggestion, action: SuggestionAction) => {
      if (!profileId) return;

      setSuggestionActionError(null);
      await queryClient.cancelQueries({ queryKey: connectionSuggestionKey });
      const previousSuggestions = queryClient.getQueryData<
        ConnectionSuggestion[]
      >(connectionSuggestionKey);
      pendingSuggestionFocusTargetRef.current = findNextSuggestionFocusTarget(
        connectionSuggestions,
        suggestion.id
      );
      queryClient.setQueryData<ConnectionSuggestion[]>(
        connectionSuggestionKey,
        old => (old ?? []).filter(item => item.id !== suggestion.id)
      );

      try {
        const response = await fetchWithTimeout<SuggestionMutationResponse>(
          suggestionActionEndpoint(suggestion, action),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profileId }),
          }
        );
        if (response.success === false) {
          throw new Error(response.error ?? 'Failed to update suggestion');
        }

        if (action === 'accept') {
          const acceptedRow = suggestionToAcceptedRow(suggestion);
          setAcceptedSuggestionRows(rows => [
            acceptedRow,
            ...rows.filter(row => row.id !== acceptedRow.id),
          ]);
          router.refresh();
        }
        await queryClient.invalidateQueries({
          queryKey: queryKeys.suggestions.all,
        });
      } catch {
        if (previousSuggestions) {
          queryClient.setQueryData(
            connectionSuggestionKey,
            previousSuggestions
          );
        } else {
          await queryClient.invalidateQueries({
            queryKey: connectionSuggestionKey,
          });
        }
        pendingSuggestionFocusTargetRef.current = suggestionFocusKey(
          suggestion.id,
          action
        );
        setSuggestionActionError({
          suggestionId: suggestion.id,
          message:
            action === 'accept'
              ? 'Could not add. Try again.'
              : 'Could not dismiss. Try again.',
        });
      }
    },
    [
      connectionSuggestionKey,
      connectionSuggestions,
      profileId,
      queryClient,
      router,
    ]
  );
  const pendingRow = useMemo<ProfileWorkspaceRow | null>(() => {
    if (!pendingCandidate) return null;
    return {
      id: `preview:${pendingCandidate.id}`,
      rowType: 'surface',
      kind:
        pendingCandidate.category === 'website'
          ? 'website'
          : pendingCandidate.category,
      platform: pendingCandidate.platformId,
      label: pendingCandidate.title,
      handle: 'Preview only · not saved',
      url: pendingCandidate.url,
      trackedUrl: null,
      qualificationStatus: 'suggested',
      isOfficial: false,
      monitoringState: 'unavailable',
      rank: null,
      previousRank: null,
      lastObservedAt: null,
    };
  }, [pendingCandidate]);
  const rows = useMemo(() => {
    if (filter === 'suggested') return [];
    const sourceRows = pendingRow
      ? [pendingRow, ...persistedAcceptedRows, ...(data?.rows ?? [])]
      : [...persistedAcceptedRows, ...(data?.rows ?? [])];
    return sortProfileWorkspaceRows(
      filter === 'review'
        ? selectPresenceReviewRows(sourceRows)
        : filterProfileWorkspaceRows(sourceRows, filter)
    );
  }, [data?.rows, filter, pendingRow, persistedAcceptedRows]);
  const handleAddConnection = useCallback(() => {
    setSelected(null);
    setPendingCandidate(null);
    setIsAddConnectionOpen(true);
  }, []);
  const headerActions = useMemo(
    () => (
      <DashboardHeaderActionGroup>
        <DashboardHeaderActionButton
          ariaLabel='Add Profile Or Site'
          onClick={handleAddConnection}
          icon={<Plus className='h-3.5 w-3.5' />}
          label='Add Page'
          hideLabelOnMobile
        />
      </DashboardHeaderActionGroup>
    ),
    [handleAddConnection]
  );
  useRegisterHeaderActions(headerActions);
  const getContextMenuItems = useCallback(
    (row: ProfileWorkspaceRow): ContextMenuItemType[] => {
      if (row.id.startsWith('preview:')) return [];
      const primaryAction = getConnectionPrimaryAction(row);
      return buildConnectionActions(row, primaryAction, {
        onViewDetails: setSelected,
        onOpen: connection => {
          if (connection.url.startsWith('http')) {
            globalThis.open(connection.url, '_blank', 'noopener,noreferrer');
            return;
          }
          router.push(connection.url);
        },
        onPrimaryAction: connection => {
          const action = getConnectionPrimaryAction(connection);
          if (action === 'review' && connection.rowType === 'surface') {
            setSelected(connection);
            return;
          }
          router.push(
            action === 'upgrade'
              ? APP_ROUTES.SETTINGS_BILLING
              : connection.rowType === 'connector'
                ? APP_ROUTES.SETTINGS_CONNECTORS
                : APP_ROUTES.SETTINGS_ARTIST_PROFILE
          );
        },
      });
    },
    [router]
  );
  const columns = useMemo(
    () => [
      columnHelper.accessor('label', {
        header: 'Platform / Page',
        size: 200,
        minSize: 140,
        meta: { className: 'px-3' },
        cell: context => {
          const row = context.row.original;
          return (
            <div className='flex min-w-0 items-center gap-2.5'>
              {row.rowType === 'connector' ? (
                <ConnectionBrandIcon
                  row={row}
                  className='h-5 w-5 shrink-0'
                  emphasized={selected?.id === row.id}
                />
              ) : (
                <PresenceIdentityPhoto
                  subject={row}
                  artistName={data?.artist.name ?? row.label}
                  size='lg'
                />
              )}
              <div className='min-w-0'>
                <div className='truncate text-sm font-medium text-primary-token'>
                  {row.label}
                </div>
                {row.rowType === 'connector' ? (
                  <ConnectionUrlDisplay
                    row={row}
                    className='text-xs text-tertiary-token max-sm:hidden'
                  />
                ) : getPresenceHandle(row) ||
                  row.label !== getPresencePlatformLabel(row) ? (
                  <div
                    data-testid='presence-page-identity'
                    className='truncate text-xs text-tertiary-token'
                    title={
                      getPresenceHandle(row) ?? getPresencePlatformLabel(row)
                    }
                  >
                    {row.label !== getPresencePlatformLabel(row) ? (
                      <span>{getPresencePlatformLabel(row)}</span>
                    ) : null}
                    {getPresenceHandle(row) ? (
                      <>
                        {row.label !== getPresencePlatformLabel(row)
                          ? ' · '
                          : null}
                        <span>{getPresenceHandle(row)}</span>
                      </>
                    ) : null}
                  </div>
                ) : null}
                <div className={styles.mobileArtist}>{data?.artist.name}</div>
                <div className={styles.mobileStatus}>
                  <StatusCell
                    row={row}
                    providerAvailable={data?.providerAvailable ?? false}
                  />
                </div>
              </div>
            </div>
          );
        },
      }),
      columnHelper.display({
        id: 'artist',
        header: 'Artist',
        size: 180,
        meta: { className: cn('px-3', styles.artistColumn) },
        cell: () => (
          <span className='truncate text-sm text-primary-token'>
            {data?.artist.name}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'type',
        header: () => <span className='sr-only'>Type</span>,
        size: 48,
        meta: { className: 'hidden' },
        cell: context => <TypeCell row={context.row.original} />,
      }),
      columnHelper.accessor(
        row => getConnectionStatus(row, data?.providerAvailable).label,
        {
          id: 'status',
          header: 'Status',
          size: 120,
          meta: { className: cn('px-2', styles.statusColumn) },
          cell: context => (
            <StatusCell
              row={context.row.original}
              providerAvailable={data?.providerAvailable ?? false}
            />
          ),
        }
      ),
      columnHelper.display({
        id: 'rank',
        header: 'Search Rank',
        size: 72,
        meta: { className: 'max-lg:hidden' },
        cell: context => <RankCell row={context.row.original} />,
      }),
      columnHelper.display({
        id: 'change',
        header: 'Change',
        size: 78,
        meta: { className: 'max-xl:hidden' },
        cell: context => {
          const row = context.row.original;
          if (row.rowType === 'connector') {
            return (
              <EmptyCell tooltip='Rank change is not available for connectors.' />
            );
          }
          const change = formatProfileRankChange(row.rank, row.previousRank);
          if (change === '—') {
            return <EmptyCell tooltip='No previous rank measurement.' />;
          }
          return (
            <span
              className={cn(
                'inline-flex items-center gap-1 tabular-nums',
                change.startsWith('+') && 'text-success',
                change.startsWith('-') && 'text-error'
              )}
            >
              {change.startsWith('+') ? (
                <ArrowUpRight className='h-3 w-3' />
              ) : null}
              {change.startsWith('-') ? (
                <ArrowDownRight className='h-3 w-3' />
              ) : null}
              {change}
            </span>
          );
        },
      }),
      columnHelper.display({
        id: 'monitoring',
        header: 'Monitoring',
        size: 124,
        meta: { className: 'hidden 2xl:table-cell' },
        cell: context => <MonitoringCell row={context.row.original} />,
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        size: 44,
        meta: {
          className: 'px-3',
          headerVisibility: 'sr-only',
          actionVisibility: 'contextual',
        },
        cell: context => {
          const row = context.row.original;
          if (row.id.startsWith('preview:')) return null;
          const actionItems = convertContextMenuItems(getContextMenuItems(row));
          return (
            <div className='flex justify-end'>
              <TableActionMenu items={actionItems} align='end' trigger='custom'>
                <button
                  type='button'
                  aria-label={`Actions for ${row.label}`}
                  onClick={event => event.stopPropagation()}
                  onKeyDown={event => event.stopPropagation()}
                  className='inline-flex h-11 w-11 items-center justify-center rounded-full border border-transparent bg-transparent text-tertiary-token transition-colors duration-fast hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus/50 sm:h-7 sm:w-7'
                >
                  <MoreHorizontal className='h-4 w-4' aria-hidden />
                </button>
              </TableActionMenu>
            </div>
          );
        },
      }),
    ],
    [
      data?.artist.name,
      data?.providerAvailable,
      getContextMenuItems,
      selected?.id,
    ]
  );

  useRegisterRightPanel(
    data ? (
      isAddConnectionOpen ? (
        <AddConnectionRail
          data={data}
          suggestedCount={connectionSuggestions.length}
          suggestionsLoading={connectionSuggestionsQuery.isLoading}
          onClose={() => {
            setPendingCandidate(null);
            setIsAddConnectionOpen(false);
          }}
          onCandidatePreview={candidate => {
            setPendingCandidate(candidate);
            if (!candidate) return;
            setFilter(
              candidate.category === 'website' ? 'identity' : 'profiles'
            );
          }}
          onReviewCandidate={candidate => {
            setPendingCandidate(candidate);
            setFilter(
              candidate.category === 'website' ? 'identity' : 'profiles'
            );
            setIsAddConnectionOpen(false);
          }}
          onReviewSuggestions={() => {
            setFilter('suggested');
            setSelected(null);
            setPendingCandidate(null);
            setIsAddConnectionOpen(false);
          }}
        />
      ) : selected ? (
        <ConnectionRail
          data={data}
          row={selected}
          onClose={() => setSelected(null)}
          contextMenuItems={convertToCommonDropdownItems(
            getContextMenuItems(selected)
          )}
        />
      ) : null
    ) : null
  );

  if (!data) {
    return (
      <PageShell
        frame='none'
        contentPadding='none'
        data-testid='profiles-workspace'
      >
        <EmptyState
          icon={<UserRound className='h-5 w-5' aria-hidden />}
          heading='No Artist Profile Selected'
          description='Set up an artist profile to monitor its presence.'
          presentation='workspace'
          action={{
            label: 'Set Up Artist Profile',
            href: APP_ROUTES.SETTINGS_ARTIST_PROFILE,
          }}
          testId='profiles-workspace-empty-state'
          className='min-h-75'
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      frame='none'
      contentPadding='none'
      data-testid='profiles-workspace'
      surfaceMode='table'
      toolbar={
        <PageToolbar
          data-testid='connections-workspace-toolbar'
          start={FILTERS.map(option => (
            <PageToolbarTabButton
              key={option.id}
              className={styles.filter}
              label={
                option.id === 'review'
                  ? `Review Pages (${selectPresenceReviewRows(data.rows).length})`
                  : option.label
              }
              active={filter === option.id}
              onClick={() => {
                setFilter(option.id);
                setSelected(null);
              }}
            />
          ))}
        />
      }
    >
      <PresenceOutcomeBoard
        data={data}
        onSelectGroup={group => {
          setFilter(presenceFilterForGroup(group));
          setSelected(null);
        }}
      />
      {filter === 'suggested' ? (
        <SuggestedConnectionsReview
          groups={suggestedGroups}
          isLoading={connectionSuggestionsQuery.isLoading}
          isError={connectionSuggestionsQuery.isError}
          actionError={suggestionActionError}
          onAction={handleSuggestionAction}
          onRetry={() => {
            void connectionSuggestionsQuery.refetch();
          }}
          registerActionRef={registerSuggestionActionRef}
          regionRef={suggestedRegionRef}
        />
      ) : (
        <UnifiedTable
          data={rows}
          columns={columns as ColumnDef<ProfileWorkspaceRow, unknown>[]}
          getRowId={row => row.id}
          onRowClick={row => {
            if (!row.id.startsWith('preview:')) setSelected(row);
          }}
          onRowContextMenu={(row, event) => {
            if (row.id.startsWith('preview:')) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          getContextMenuItems={getContextMenuItems}
          rowHeight={56}
          containerClassName='min-h-0 flex-1'
          minWidth='0'
          className={styles.table}
          isRowSelected={row =>
            !row.id.startsWith('preview:') && selected?.id === row.id
          }
          getRowClassName={row =>
            cn(
              'group/connection-row',
              row.id.startsWith('preview:') && 'cursor-default'
            )
          }
          emptyState={
            <TableEmptyState
              heading={
                filter === 'review'
                  ? 'No Pages Awaiting Identity Review'
                  : 'No Presence in This Category'
              }
              description={
                filter === 'review'
                  ? 'Your pages remain available in All Pages. Monitoring coverage is separate.'
                  : 'Try another filter.'
              }
            />
          }
        />
      )}
    </PageShell>
  );
}
