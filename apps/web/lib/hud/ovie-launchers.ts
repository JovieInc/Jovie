export type OvieLauncherGroup = 'internal' | 'external';
export type OvieLauncherKind = 'web' | 'ssh';
export type OvieLauncherOwner = 'human' | 'agent';
export type OvieLauncherLoop =
  | 'review'
  | 'approve'
  | 'observe'
  | 'communicate'
  | 'recover';
export type OvieLauncherStatus =
  | 'ready'
  | 'unavailable'
  | 'not_configured'
  | 'error';

export const OVIE_REQUIRED_PRIMARY_LAUNCHER_IDS = [
  'gbrain',
  'hermes',
  'symphony',
  'mercury',
  'gmail',
  'github-prs',
  'vercel',
] as const;

export const OVIE_CONFIGURED_PUBLIC_ORIGINS = {
  mercury: 'https://app.mercury.com',
  gmail: 'https://mail.google.com',
  linear: 'https://linear.app/jovie',
  vercelDashboard: 'https://vercel.com/dashboard',
  status: 'https://status.jov.ie',
  githubOwner: 'JovieInc',
  githubRepo: 'Jovie',
} as const;

export const HERMES_GATEWAY_TEMPLATE_ORIGIN = 'http://127.0.0.1:7800';
export const GBRAIN_HTTP_TEMPLATE_ORIGIN = 'http://127.0.0.1:7801';
export const SYMPHONY_SSH_TEMPLATE_HOST = 'gem';

export interface OvieLauncherDefinition {
  readonly id: string;
  readonly label: string;
  readonly group: OvieLauncherGroup;
  readonly kind: OvieLauncherKind;
  readonly owner: OvieLauncherOwner;
  readonly loop: OvieLauncherLoop;
  readonly requiredOnPrimary: boolean;
  readonly agentCliOnly: boolean;
  readonly searchTerms: readonly string[];
  readonly destinationSummary: string;
}

function human(
  id: string,
  label: string,
  group: OvieLauncherGroup,
  kind: OvieLauncherKind,
  loop: OvieLauncherLoop,
  requiredOnPrimary: boolean,
  terms: string,
  destinationSummary: string
): OvieLauncherDefinition {
  return {
    id,
    label,
    group,
    kind,
    owner: 'human',
    loop,
    requiredOnPrimary,
    agentCliOnly: false,
    searchTerms: terms.split(' '),
    destinationSummary,
  };
}

function agentCli(
  id: string,
  label: string,
  loop: OvieLauncherLoop,
  terms: string,
  destinationSummary: string
): OvieLauncherDefinition {
  return {
    id,
    label,
    group: 'internal',
    kind: 'ssh',
    owner: 'agent',
    loop,
    requiredOnPrimary: false,
    agentCliOnly: true,
    searchTerms: terms.split(' '),
    destinationSummary,
  };
}

export const OVIE_LAUNCHER_CATALOG: readonly OvieLauncherDefinition[] = [
  human(
    'gbrain',
    'GBrain',
    'internal',
    'web',
    'observe',
    true,
    'gbrain memory wiki',
    'GBrain web from GBRAIN_API_URL'
  ),
  human(
    'hermes',
    'Hermes',
    'internal',
    'web',
    'observe',
    true,
    'hermes gateway air',
    'Hermes web from Air gateway template'
  ),
  human(
    'symphony',
    'Symphony',
    'internal',
    'ssh',
    'recover',
    true,
    'symphony gem tui elixir',
    'Official Elixir Symphony TUI on Gem via SSH'
  ),
  human(
    'mercury',
    'Mercury',
    'external',
    'web',
    'observe',
    true,
    'mercury bank cash runway',
    'Official Mercury app'
  ),
  human(
    'gmail',
    'Gmail',
    'external',
    'web',
    'communicate',
    true,
    'gmail mail email',
    'Official Gmail web app'
  ),
  human(
    'github-prs',
    'GitHub PRs',
    'external',
    'web',
    'review',
    true,
    'github pull pr review',
    'Configured GitHub repo pull request list'
  ),
  human(
    'vercel',
    'Vercel',
    'external',
    'web',
    'observe',
    true,
    'vercel deploy production',
    'Canonical Vercel dashboard from Ops costs'
  ),
  human(
    'linear',
    'Linear',
    'external',
    'web',
    'approve',
    false,
    'linear issues backlog',
    'Jovie Linear team'
  ),
  human(
    'status',
    'Status',
    'external',
    'web',
    'observe',
    false,
    'status uptime incident',
    'Canonical status.jov.ie'
  ),
  human(
    'production',
    'Production',
    'external',
    'web',
    'observe',
    false,
    'production jov.ie site',
    'Production origin from NEXT_PUBLIC_APP_URL'
  ),
  agentCli(
    'hermes-cli-worker',
    'Hermes CLI worker',
    'recover',
    'hermes cli worker agent',
    'Agent-owned CLI worker'
  ),
  agentCli(
    'symphony-lease-guard',
    'Symphony lease guard',
    'recover',
    'lease guard symphony cli',
    'Agent-owned lease CLI'
  ),
  agentCli(
    'gbrain-search-cli',
    'GBrain CLI',
    'observe',
    'gbrain cli search',
    'Agent-owned gbrain CLI'
  ),
];

export interface OvieLauncherResolvedDestination {
  readonly href?: string;
  readonly sshHost?: string;
  readonly display: string;
  readonly configured: boolean;
  readonly source: string;
}

export interface OvieLauncherVerifiedState {
  readonly timActionCount: number;
  readonly availability: Readonly<Record<string, OvieLauncherStatus>>;
}

export interface OvieLauncherControl {
  readonly id: string;
  readonly label: string;
  readonly group: OvieLauncherGroup;
  readonly kind: OvieLauncherKind;
  readonly owner: OvieLauncherOwner;
  readonly loop: OvieLauncherLoop;
  readonly requiredOnPrimary: boolean;
  readonly agentCliOnly: boolean;
  readonly status: OvieLauncherStatus;
  readonly rankScore: number;
  readonly why: string;
  readonly destinationSummary: string;
  readonly destinationDisplay: string;
  readonly href?: string;
  readonly sshHost?: string;
  readonly searchText: string;
}

export interface OvieLauncherInventory {
  readonly generatedAtIso: string;
  readonly primary: readonly OvieLauncherControl[];
  readonly advanced: readonly OvieLauncherControl[];
  readonly all: readonly OvieLauncherControl[];
}

export class OvieLauncherInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OvieLauncherInvariantError';
  }
}

const TOKENISH =
  /(?:api[_-]?key|token|secret|password|bearer|authorization)=([^&\s]+)/gi;

export function stripSecrets(text: string): string {
  return text.replace(
    TOKENISH,
    match => `${match.slice(0, match.indexOf('='))}=redacted`
  );
}

export function publicHref(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      return null;
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

export function originFromUrl(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const href = publicHref(raw.trim());
  return href ? new URL(href).origin : null;
}

export function githubPullsUrl(owner?: string, repo?: string): string | null {
  const resolvedOwner =
    owner?.trim() || OVIE_CONFIGURED_PUBLIC_ORIGINS.githubOwner;
  const resolvedRepo =
    repo?.trim() || OVIE_CONFIGURED_PUBLIC_ORIGINS.githubRepo;
  if (!/^[A-Za-z0-9_.-]+$/.test(resolvedOwner)) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(resolvedRepo)) return null;
  return `https://github.com/${resolvedOwner}/${resolvedRepo}/pulls`;
}

export function isSafeSshHost(host: string | undefined): host is string {
  return Boolean(host && /^[A-Za-z0-9][A-Za-z0-9.-]{0,253}$/.test(host));
}

function webOrigin(
  href: string,
  source: string,
  configured = true
): OvieLauncherResolvedDestination {
  return { href, display: href, configured, source };
}

export function resolveLauncherDestination(
  definition: OvieLauncherDefinition,
  config: {
    readonly gbrainApiUrl?: string;
    readonly hermesWebUrl?: string;
    readonly symphonySshHost?: string;
    readonly githubOwner?: string;
    readonly githubRepo?: string;
    readonly productionOrigin?: string;
  }
): OvieLauncherResolvedDestination {
  switch (definition.id) {
    case 'gbrain': {
      const configured = originFromUrl(config.gbrainApiUrl);
      return webOrigin(
        configured ?? GBRAIN_HTTP_TEMPLATE_ORIGIN,
        configured ? 'GBRAIN_API_URL' : 'gbrain HTTP template',
        Boolean(configured)
      );
    }
    case 'hermes': {
      const configured = originFromUrl(config.hermesWebUrl);
      return webOrigin(
        configured ?? HERMES_GATEWAY_TEMPLATE_ORIGIN,
        configured ? 'HERMES_WEB_URL' : 'Hermes Air gateway template',
        Boolean(configured)
      );
    }
    case 'symphony':
      return {
        sshHost: SYMPHONY_SSH_TEMPLATE_HOST,
        display: `ssh ${SYMPHONY_SSH_TEMPLATE_HOST}`,
        configured: true,
        source: 'documented Gem SSH alias',
      };
    case 'mercury':
      return webOrigin(
        OVIE_CONFIGURED_PUBLIC_ORIGINS.mercury,
        'official Mercury app'
      );
    case 'gmail':
      return webOrigin(
        OVIE_CONFIGURED_PUBLIC_ORIGINS.gmail,
        'official Gmail app'
      );
    case 'github-prs': {
      const href = githubPullsUrl(config.githubOwner, config.githubRepo);
      return {
        href: href ?? undefined,
        display: href ?? 'GitHub PRs not configured',
        configured: Boolean(href),
        source:
          config.githubOwner || config.githubRepo
            ? 'HUD_GITHUB_OWNER/HUD_GITHUB_REPO'
            : 'desktop GitHub repo constants',
      };
    }
    case 'vercel':
      return webOrigin(
        OVIE_CONFIGURED_PUBLIC_ORIGINS.vercelDashboard,
        'Ops costs Vercel dashboard'
      );
    case 'linear':
      return webOrigin(
        OVIE_CONFIGURED_PUBLIC_ORIGINS.linear,
        'Jovie Linear team URL'
      );
    case 'status':
      return webOrigin(OVIE_CONFIGURED_PUBLIC_ORIGINS.status, 'status.jov.ie');
    case 'production': {
      const origin = originFromUrl(config.productionOrigin);
      return {
        href: origin ?? undefined,
        display: origin ?? 'Production origin not configured',
        configured: Boolean(origin),
        source: 'NEXT_PUBLIC_APP_URL',
      };
    }
    default:
      return { display: 'CLI only', configured: false, source: 'agent CLI' };
  }
}

export function rankScoreForControl(input: {
  readonly definition: OvieLauncherDefinition;
  readonly status: OvieLauncherStatus;
  readonly timActionCount: number;
}): number {
  const { definition, status, timActionCount } = input;
  if (definition.agentCliOnly || definition.owner === 'agent') return -1000;
  let score = definition.requiredOnPrimary ? 100 : 40;
  if (status === 'ready') score += 20;
  if (status === 'unavailable' || status === 'error') {
    score += definition.loop === 'recover' ? 25 : -5;
  }
  if (timActionCount > 0) {
    if (definition.loop === 'review' || definition.loop === 'approve')
      score += 30;
    if (definition.loop === 'communicate') score += 15;
  }
  return score;
}

export function whyForControl(input: {
  readonly definition: OvieLauncherDefinition;
  readonly status: OvieLauncherStatus;
  readonly destination: OvieLauncherResolvedDestination;
  readonly timActionCount: number;
}): string {
  const { definition, status, destination, timActionCount } = input;
  if (definition.agentCliOnly) {
    return 'Agent-owned CLI. Kept in diagnostics so it cannot crowd the human rail.';
  }
  const statusWhy =
    status === 'ready'
      ? 'Destination preflight succeeded.'
      : status === 'not_configured'
        ? 'No configured destination yet.'
        : 'Preflight did not reach the destination.';
  const loopWhy =
    timActionCount > 0 &&
    (definition.loop === 'review' || definition.loop === 'approve')
      ? ` ${timActionCount} open Tim-action issue(s) raise review/approve tools.`
      : '';
  return stripSecrets(
    `${statusWhy} ${definition.destinationSummary} (${destination.source}).${loopWhy}`
  );
}

export function buildLauncherControl(input: {
  readonly definition: OvieLauncherDefinition;
  readonly destination: OvieLauncherResolvedDestination;
  readonly status: OvieLauncherStatus;
  readonly timActionCount: number;
}): OvieLauncherControl {
  const { definition, destination, status, timActionCount } = input;
  return {
    id: definition.id,
    label: definition.label,
    group: definition.group,
    kind: definition.kind,
    owner: definition.owner,
    loop: definition.loop,
    requiredOnPrimary: definition.requiredOnPrimary,
    agentCliOnly: definition.agentCliOnly,
    status,
    rankScore: rankScoreForControl({ definition, status, timActionCount }),
    why: whyForControl({ definition, status, destination, timActionCount }),
    destinationSummary: definition.destinationSummary,
    destinationDisplay: stripSecrets(destination.display),
    href: destination.href,
    sshHost: destination.sshHost,
    searchText: [
      definition.label,
      definition.id,
      definition.loop,
      definition.group,
      destination.display,
      ...definition.searchTerms,
    ]
      .join(' ')
      .toLowerCase(),
  };
}

function byRankThenLabel(
  a: OvieLauncherControl,
  b: OvieLauncherControl
): number {
  return b.rankScore !== a.rankScore
    ? b.rankScore - a.rankScore
    : a.label.localeCompare(b.label);
}

export function assertPrimaryRailInvariants(
  inventory: Pick<OvieLauncherInventory, 'primary' | 'advanced' | 'all'>
): void {
  const primaryIds = new Set(inventory.primary.map(control => control.id));
  for (const requiredId of OVIE_REQUIRED_PRIMARY_LAUNCHER_IDS) {
    if (!primaryIds.has(requiredId)) {
      throw new OvieLauncherInvariantError(
        `Required human control "${requiredId}" is missing from the primary rail`
      );
    }
  }
  const agentOnPrimary = inventory.primary.find(
    control => control.owner === 'agent' || control.agentCliOnly
  );
  if (agentOnPrimary) {
    throw new OvieLauncherInvariantError(
      `Agent-only control "${agentOnPrimary.id}" cannot appear on the primary rail`
    );
  }
}

export function rankLaunchers(input: {
  readonly catalog?: readonly OvieLauncherDefinition[];
  readonly destinations: Readonly<
    Record<string, OvieLauncherResolvedDestination>
  >;
  readonly state: OvieLauncherVerifiedState;
  readonly generatedAtIso?: string;
}): OvieLauncherInventory {
  const catalog = input.catalog ?? OVIE_LAUNCHER_CATALOG;
  const all = catalog.map(definition => {
    const destination = input.destinations[definition.id] ?? {
      display: 'Not configured',
      configured: false,
      source: 'missing',
    };
    const status = definition.agentCliOnly
      ? 'not_configured'
      : (input.state.availability[definition.id] ??
        (destination.configured || destination.href || destination.sshHost
          ? 'unavailable'
          : 'not_configured'));
    return buildLauncherControl({
      definition,
      destination,
      status,
      timActionCount: input.state.timActionCount,
    });
  });
  const primary = all
    .filter(
      control =>
        control.owner === 'human' &&
        !control.agentCliOnly &&
        (control.requiredOnPrimary || control.rankScore >= 60)
    )
    .toSorted(byRankThenLabel);
  const required = all.filter(control => control.requiredOnPrimary);
  const inventory: OvieLauncherInventory = {
    generatedAtIso: input.generatedAtIso ?? new Date(0).toISOString(),
    primary: [
      ...primary,
      ...required.filter(
        control => !primary.some(item => item.id === control.id)
      ),
    ].toSorted(byRankThenLabel),
    advanced: all
      .filter(control => control.agentCliOnly || control.owner === 'agent')
      .toSorted(byRankThenLabel),
    all: all.toSorted(byRankThenLabel),
  };
  assertPrimaryRailInvariants(inventory);
  return inventory;
}

export function filterLaunchers(
  controls: readonly OvieLauncherControl[],
  query: string
): readonly OvieLauncherControl[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return controls;
  return controls.filter(control =>
    tokens.every(token => control.searchText.includes(token))
  );
}
