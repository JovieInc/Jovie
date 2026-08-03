'use client';

import { Button, Input } from '@jovie/ui';
import {
  Cable,
  CalendarDays,
  ChevronLeft,
  Link2,
  Mail,
  Plus,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import {
  looksLikeUrlOrDomain,
  rankPlatformOptions,
} from '@/components/features/dashboard/molecules/universal-link-input/utils';
import { PLATFORM_OPTIONS } from '@/components/features/dashboard/molecules/universalLinkInput.constants';
import {
  DrawerSection,
  EntityHeaderCard,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { APP_ROUTES } from '@/constants/routes';
import { getConnectorDefinitions } from '@/lib/connectors/registry';
import { canonicalizeSurfaceUrl } from '@/lib/profile-surfaces/contracts';
import { cn } from '@/lib/utils';
import { detectPlatform, normalizeUrl } from '@/lib/utils/platform-detection';
import type { ProfilesWorkspaceData } from './data';

type AddConnectionView = 'home' | 'services' | 'profile';

const HANDLE_PLATFORM_IDS = new Set([
  'instagram',
  'tiktok',
  'youtube',
  'twitter',
  'facebook',
  'soundcloud',
  'twitch',
  'linkedin',
  'venmo',
  'threads',
  'telegram',
  'snapchat',
]);

const HANDLE_OPTIONS = PLATFORM_OPTIONS.filter(option =>
  HANDLE_PLATFORM_IDS.has(option.id)
);

export interface ConnectionIntakeCandidate {
  readonly id: string;
  readonly platformId: string;
  readonly platformName: string;
  readonly icon: string;
  readonly category: 'dsp' | 'social' | 'website';
  readonly url: string;
  readonly handle: string | null;
  readonly title: string;
}

interface ConnectionIntakeResult {
  readonly candidate: ConnectionIntakeCandidate | null;
  readonly suggestions: readonly ConnectionIntakeCandidate[];
  readonly error: string | null;
}

function comparablePlatformId(value: string): string {
  return value.replaceAll('-', '_').replace(/^x$/, 'twitter');
}

function isExistingPlatform(
  platformId: string,
  existingPlatforms: readonly string[]
): boolean {
  const comparable = comparablePlatformId(platformId);
  return existingPlatforms.some(
    existing => comparablePlatformId(existing) === comparable
  );
}

function extractHandle(url: string): string | null {
  try {
    const parsed = new URL(url);
    const segment = parsed.pathname
      .split('/')
      .filter(Boolean)
      .at(-1)
      ?.replace(/^@/, '');
    return segment ? `@${segment}` : null;
  } catch {
    return null;
  }
}

function toCandidate(
  input: string,
  creatorName?: string
): ConnectionIntakeCandidate | null {
  const canonical = canonicalizeSurfaceUrl(normalizeUrl(input));
  if (!canonical) return null;

  const detected = detectPlatform(canonical.url, creatorName);
  const knownPlatform = detected.platform.id !== 'website';
  const category =
    detected.platform.category === 'dsp'
      ? 'dsp'
      : knownPlatform
        ? 'social'
        : 'website';

  return {
    id: `${detected.platform.id}:${canonical.url}`,
    platformId: detected.platform.id,
    platformName: knownPlatform ? detected.platform.name : 'Website',
    icon: knownPlatform ? detected.platform.icon : 'globe',
    category,
    url: canonical.url,
    handle: extractHandle(canonical.url),
    title: knownPlatform ? detected.suggestedTitle : canonical.hostname,
  };
}

function parseHandleIntent(
  input: string
): { readonly handle: string; readonly platformQuery: string } | null {
  const trimmed = input.trim();
  if (!trimmed || looksLikeUrlOrDomain(trimmed)) return null;

  const parts = trimmed.split(/\s+/);
  const rawHandle = parts.at(-1) ?? '';
  const handle = rawHandle.replace(/^@/, '');
  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(handle)) return null;

  return {
    handle,
    platformQuery: parts.slice(0, -1).join(' '),
  };
}

function handleSuggestions(
  input: string,
  existingPlatforms: readonly string[],
  creatorName?: string
): readonly ConnectionIntakeCandidate[] {
  const intent = parseHandleIntent(input);
  if (!intent) return [];

  const ranked = rankPlatformOptions(
    intent.platformQuery,
    HANDLE_OPTIONS,
    existingPlatforms
  );

  return ranked
    .filter(option => !isExistingPlatform(option.id, existingPlatforms))
    .slice(0, 5)
    .flatMap(option => {
      const candidate = toCandidate(
        `${option.prefill}${intent.handle}`,
        creatorName
      );
      if (!candidate) return [];

      return [
        {
          ...candidate,
          id: `${option.id}:${candidate.url}`,
          platformId: option.id,
          platformName: option.name,
          icon: option.icon,
          category: option.category === 'music' ? 'dsp' : 'social',
          handle: `@${intent.handle}`,
          title: creatorName
            ? `${creatorName} on ${option.name}`
            : `@${intent.handle} on ${option.name}`,
        },
      ];
    });
}

export function classifyConnectionInput(
  input: string,
  existingPlatforms: readonly string[],
  creatorName?: string
): ConnectionIntakeResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { candidate: null, suggestions: [], error: null };
  }

  if (looksLikeUrlOrDomain(trimmed)) {
    const candidate = toCandidate(trimmed, creatorName);
    return {
      candidate,
      suggestions: [],
      error: candidate
        ? null
        : 'Enter a public URL or domain without credentials.',
    };
  }

  const suggestions = handleSuggestions(
    trimmed,
    existingPlatforms,
    creatorName
  );
  return {
    candidate: null,
    suggestions,
    error:
      suggestions.length > 0
        ? null
        : 'Enter a URL, domain, @handle, or username.',
  };
}

function ConnectorIcon({
  iconKey,
  className,
}: Readonly<{ iconKey: 'mail' | 'calendar'; className?: string }>) {
  const Icon = iconKey === 'mail' ? Mail : CalendarDays;
  return <Icon className={className} aria-hidden />;
}

function ChoiceRow({
  icon,
  title,
  description,
  onClick,
}: Readonly<{
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}>) {
  return (
    <button
      type='button'
      onClick={onClick}
      className='group flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors duration-fast hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus/50'
    >
      <span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-secondary-token group-hover:text-accent'>
        {icon}
      </span>
      <span className='min-w-0 space-y-0.5'>
        <span className='block text-sm font-medium text-primary-token'>
          {title}
        </span>
        <span className='block text-xs leading-5 text-secondary-token'>
          {description}
        </span>
      </span>
    </button>
  );
}

/**
 * In-flow add surface for the Connections workspace. Provider availability is
 * intentionally derived from the connector registry: unsupported DSP/social
 * services never appear as implied integrations.
 */
export function AddConnectionRail({
  data,
  onClose,
  onCandidatePreview,
  onReviewCandidate,
  onReviewSuggestions,
}: Readonly<{
  data: ProfilesWorkspaceData;
  onClose: () => void;
  onCandidatePreview: (candidate: ConnectionIntakeCandidate | null) => void;
  onReviewCandidate: (candidate: ConnectionIntakeCandidate) => void;
  onReviewSuggestions: () => void;
}>) {
  const router = useRouter();
  const [view, setView] = useState<AddConnectionView>('home');
  const [profileUrl, setProfileUrl] = useState('');
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const existingPlatforms = useMemo(
    () => data.rows.map(row => row.platform),
    [data.rows]
  );
  const intake = useMemo(
    () =>
      classifyConnectionInput(profileUrl, existingPlatforms, data.artist.name),
    [data.artist.name, existingPlatforms, profileUrl]
  );
  const suggestedCount = data.rows.filter(
    row => row.rowType === 'surface' && row.qualificationStatus === 'suggested'
  ).length;
  const connectors = getConnectorDefinitions();

  useEffect(() => {
    onCandidatePreview(intake.candidate);
  }, [intake.candidate, onCandidatePreview]);

  useEffect(() => {
    setActiveSuggestionIndex(index =>
      Math.min(index, Math.max(0, intake.suggestions.length - 1))
    );
  }, [intake.suggestions.length]);

  const selectSuggestion = (candidate: ConnectionIntakeCandidate) => {
    setProfileUrl(candidate.url);
    setActiveSuggestionIndex(0);
  };

  const handleProfileKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (intake.suggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSuggestionIndex(index =>
        index < intake.suggestions.length - 1 ? index + 1 : 0
      );
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSuggestionIndex(index =>
        index > 0 ? index - 1 : intake.suggestions.length - 1
      );
      return;
    }
    if (event.key === 'Enter') {
      const suggestion = intake.suggestions[activeSuggestionIndex];
      if (!suggestion) return;
      event.preventDefault();
      selectSuggestion(suggestion);
    }
  };

  const title =
    view === 'services'
      ? 'Connect services'
      : view === 'profile'
        ? 'Add public profile'
        : 'Add connection';

  return (
    <EntitySidebarShell
      isOpen
      ariaLabel='Add connection'
      scrollStrategy='shell'
      workspaceSurface='raised'
      headerMode='minimal'
      hideMinimalHeaderBar
      entityHeaderSurface='flat'
      footer={
        view === 'profile' ? (
          <Button
            type='button'
            size='sm'
            className='w-full'
            disabled={!intake.candidate}
            onClick={() => {
              if (intake.candidate) onReviewCandidate(intake.candidate);
            }}
          >
            Review profile
          </Button>
        ) : undefined
      }
      footerSurface='flat'
      entityHeader={
        <EntityHeaderCard
          image={
            <div className='flex h-9 w-9 items-center justify-center rounded-md bg-surface-2 text-accent'>
              <Plus className='h-4 w-4' aria-hidden />
            </div>
          }
          title={title}
          subtitle='Connections'
          stableLayout
          reserveSubtitleSlot
          actions={
            <DrawerHeaderActions
              primaryActions={
                view === 'home'
                  ? []
                  : [
                      {
                        id: 'back',
                        label: 'Back',
                        icon: ChevronLeft,
                        onClick: () => setView('home'),
                      },
                    ]
              }
              overflowActions={[]}
              onClose={onClose}
            />
          }
          bodyClassName='pr-8'
          data-testid='profiles-add-connection-header'
        />
      }
    >
      {view === 'home' ? (
        <DrawerSection sectionKind='details' surface='plain' className='py-1'>
          <ChoiceRow
            icon={<CableIcon />}
            title='Connect services'
            description='Connect the services Jovie can securely support today.'
            onClick={() => setView('services')}
          />
          <ChoiceRow
            icon={<Link2 className='h-4 w-4' aria-hidden />}
            title='Add public profile'
            description='Add a public URL with canonicalization before review.'
            onClick={() => setView('profile')}
          />
          <ChoiceRow
            icon={<ReviewIcon />}
            title='Review suggestions'
            description={
              suggestedCount > 0
                ? `${suggestedCount} suggested ${suggestedCount === 1 ? 'profile' : 'profiles'} to review.`
                : 'No suggested profiles are waiting for review.'
            }
            onClick={onReviewSuggestions}
          />
        </DrawerSection>
      ) : null}

      {view === 'services' ? (
        <DrawerSection sectionKind='details' surface='plain' className='py-1'>
          <div className='divide-y divide-subtle'>
            {connectors.map(connector => (
              <button
                key={connector.id}
                type='button'
                onClick={() =>
                  router.push(
                    `/api/connectors/google/authorize?returnTo=${encodeURIComponent(APP_ROUTES.PROFILES)}`
                  )
                }
                className='flex w-full items-start gap-3 px-3 py-3 text-left transition-colors duration-fast hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus/50'
              >
                <span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-secondary-token'>
                  <ConnectorIcon
                    iconKey={connector.iconKey}
                    className='h-4 w-4'
                  />
                </span>
                <span className='min-w-0 flex-1'>
                  <span className='block text-sm font-medium text-primary-token'>
                    {connector.label}
                  </span>
                  <span className='block text-xs leading-5 text-secondary-token'>
                    {connector.description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </DrawerSection>
      ) : null}

      {view === 'profile' ? (
        <DrawerSection
          title='Public profile'
          sectionKind='details'
          surface='plain'
          className='flex h-full min-h-0 flex-col'
          contentClassName='flex min-h-0 flex-1 flex-col'
        >
          <div className='flex min-h-72 flex-1 flex-col gap-3 px-3 pb-2'>
            <Input
              aria-label='Public profile URL'
              aria-controls={
                intake.suggestions.length > 0
                  ? 'connection-intake-suggestions'
                  : undefined
              }
              aria-activedescendant={
                intake.suggestions.length > 0
                  ? `connection-intake-suggestion-${activeSuggestionIndex}`
                  : undefined
              }
              aria-autocomplete='list'
              autoComplete='off'
              placeholder='URL, @handle, or username'
              value={profileUrl}
              onChange={event => {
                setProfileUrl(event.target.value);
                setActiveSuggestionIndex(0);
              }}
              onKeyDown={handleProfileKeyDown}
            />

            <div className='min-h-28'>
              {intake.candidate ? (
                <div className='flex items-center gap-2 rounded-lg bg-surface-1 px-2.5 py-2'>
                  <span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-2 text-secondary-token'>
                    <SocialIcon
                      platform={intake.candidate.platformId}
                      className='h-4 w-4'
                    />
                  </span>
                  <span className='min-w-0 flex-1'>
                    <span className='block truncate text-sm font-medium text-primary-token'>
                      {intake.candidate.platformName}
                    </span>
                    <span className='block truncate text-xs text-tertiary-token'>
                      {intake.candidate.url}
                    </span>
                  </span>
                  <span className='text-2xs font-medium uppercase tracking-wide text-accent'>
                    Detected
                  </span>
                </div>
              ) : null}

              {intake.suggestions.length > 0 ? (
                <div
                  id='connection-intake-suggestions'
                  role='listbox'
                  aria-label='Suggested profile destinations'
                  className='flex flex-wrap gap-1.5 sm:flex-col sm:gap-1'
                >
                  {intake.suggestions.map((suggestion, index) => (
                    <button
                      key={suggestion.id}
                      id={`connection-intake-suggestion-${index}`}
                      type='button'
                      role='option'
                      aria-selected={index === activeSuggestionIndex}
                      onMouseEnter={() => setActiveSuggestionIndex(index)}
                      onClick={() => selectSuggestion(suggestion)}
                      className={cn(
                        'inline-flex min-w-0 items-center gap-2 rounded-full px-2.5 py-1.5 text-left text-xs text-secondary-token transition-colors duration-fast hover:bg-surface-2 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus/50 sm:w-full sm:rounded-lg sm:py-2',
                        index === activeSuggestionIndex &&
                          'bg-surface-2 text-primary-token'
                      )}
                    >
                      <SocialIcon
                        platform={suggestion.platformId}
                        className='h-3.5 w-3.5 shrink-0'
                      />
                      <span className='truncate font-medium'>
                        {suggestion.platformName}
                      </span>
                      <span className='truncate text-tertiary-token sm:ml-auto'>
                        {suggestion.handle}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              {intake.error ? (
                <p className='text-xs leading-5 text-error'>{intake.error}</p>
              ) : null}
            </div>

            <p className='text-xs leading-5 text-tertiary-token'>
              Jovie classifies public identities as you type. Preview rows are
              temporary until a supported connection is confirmed.
            </p>
          </div>
        </DrawerSection>
      ) : null}
    </EntitySidebarShell>
  );
}

function CableIcon() {
  return <Cable className='h-4 w-4' aria-hidden />;
}

function ReviewIcon() {
  return <Link2 className='h-4 w-4' aria-hidden />;
}
