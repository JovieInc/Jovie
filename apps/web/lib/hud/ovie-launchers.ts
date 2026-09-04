export type OvieLauncherGroup = 'internal' | 'external';
export type OvieLauncherKind = 'web' | 'ssh';
export type OvieLauncherOwner = 'human' | 'agent';
// biome-ignore format: compact unions
export type OvieLauncherLoop =
  | 'review' | 'approve' | 'observe' | 'communicate' | 'recover';
// biome-ignore format: compact unions
export type OvieLauncherStatus =
  | 'ready' | 'unavailable' | 'not_configured' | 'error';

// biome-ignore format: compact required-id list
export const OVIE_REQUIRED_PRIMARY_LAUNCHER_IDS = [
  'gbrain', 'hermes', 'symphony', 'mercury', 'gmail', 'github-prs', 'vercel',
] as const;

// biome-ignore format: compact origins
export const OVIE_CONFIGURED_PUBLIC_ORIGINS = {
  mercury: 'https://app.mercury.com', gmail: 'https://mail.google.com',
  linear: 'https://linear.app/jovie', vercelDashboard: 'https://vercel.com/dashboard',
  status: 'https://status.jov.ie', githubOwner: 'JovieInc', githubRepo: 'Jovie',
} as const;

export const HERMES_GATEWAY_TEMPLATE_ORIGIN = 'http://127.0.0.1:7800';
export const GBRAIN_HTTP_TEMPLATE_ORIGIN = 'http://127.0.0.1:7801';
export const SYMPHONY_SSH_TEMPLATE_HOST = 'gem';

// biome-ignore format: compact definition
export interface OvieLauncherDefinition {
  readonly id: string; readonly label: string;
  readonly group: OvieLauncherGroup; readonly kind: OvieLauncherKind;
  readonly owner: OvieLauncherOwner; readonly loop: OvieLauncherLoop;
  readonly requiredOnPrimary: boolean; readonly agentCliOnly: boolean;
  readonly searchTerms: readonly string[]; readonly destinationSummary: string;
}

function parseCatalogRow(line: string): OvieLauncherDefinition {
  const [id, label, group, kind, loop, owner, required, agent, terms, dest] =
    line.split('|');
  // biome-ignore format: compact catalog row
  return {
    id, label, group: group as OvieLauncherGroup, kind: kind as OvieLauncherKind,
    loop: loop as OvieLauncherLoop, owner: owner as OvieLauncherOwner,
    requiredOnPrimary: required === '1', agentCliOnly: agent === '1',
    searchTerms: terms.split(' '), destinationSummary: dest,
  };
}

export const OVIE_LAUNCHER_CATALOG: readonly OvieLauncherDefinition[] = `
gbrain|GBrain|internal|web|observe|human|1|0|gbrain memory wiki|GBrain web from GBRAIN_API_URL
hermes|Hermes|internal|web|observe|human|1|0|hermes gateway air|Hermes web from Air gateway template
symphony|Symphony|internal|ssh|recover|human|1|0|symphony gem tui elixir|Official Elixir Symphony TUI on Gem via SSH
mercury|Mercury|external|web|observe|human|1|0|mercury bank cash runway|Official Mercury app
gmail|Gmail|external|web|communicate|human|1|0|gmail mail email|Official Gmail web app
github-prs|GitHub PRs|external|web|review|human|1|0|github pull pr review|Configured GitHub repo pull request list
vercel|Vercel|external|web|observe|human|1|0|vercel deploy production|Canonical Vercel dashboard from Ops costs
linear|Linear|external|web|approve|human|0|0|linear issues backlog|Jovie Linear team
status|Status|external|web|observe|human|0|0|status uptime incident|Canonical status.jov.ie
production|Production|external|web|observe|human|0|0|production jov.ie site|Production origin from NEXT_PUBLIC_APP_URL
hermes-cli-worker|Hermes CLI worker|internal|ssh|recover|agent|0|1|hermes cli worker agent|Agent-owned CLI worker
symphony-lease-guard|Symphony lease guard|internal|ssh|recover|agent|0|1|lease guard symphony cli|Agent-owned lease CLI
gbrain-search-cli|GBrain CLI|internal|ssh|observe|agent|0|1|gbrain cli search|Agent-owned gbrain CLI
`
  .trim()
  .split('\n')
  .map(parseCatalogRow);

// biome-ignore format: compact destination
export interface OvieLauncherResolvedDestination {
  readonly href?: string; readonly sshHost?: string;
  readonly display: string; readonly configured: boolean; readonly source: string;
}

export interface OvieLauncherVerifiedState {
  readonly timActionCount: number;
  readonly availability: Readonly<Record<string, OvieLauncherStatus>>;
}

// biome-ignore format: compact control
export interface OvieLauncherControl extends OvieLauncherDefinition {
  readonly status: OvieLauncherStatus; readonly rankScore: number;
  readonly why: string; readonly destinationDisplay: string;
  readonly href?: string; readonly sshHost?: string; readonly searchText: string;
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

const STATIC_WEB: Record<string, readonly [href: string, source: string]> = {
  mercury: [OVIE_CONFIGURED_PUBLIC_ORIGINS.mercury, 'official Mercury app'],
  gmail: [OVIE_CONFIGURED_PUBLIC_ORIGINS.gmail, 'official Gmail app'],
  // biome-ignore format: compact tuple
  vercel: [OVIE_CONFIGURED_PUBLIC_ORIGINS.vercelDashboard, 'Ops costs Vercel dashboard'],
  linear: [OVIE_CONFIGURED_PUBLIC_ORIGINS.linear, 'Jovie Linear team URL'],
  status: [OVIE_CONFIGURED_PUBLIC_ORIGINS.status, 'status.jov.ie'],
};

export function stripSecrets(text: string): string {
  return text.replace(
    TOKENISH,
    match => `${match.slice(0, match.indexOf('='))}=redacted`
  );
}

export function publicHref(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
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

// biome-ignore format: compact destination helpers
function optionalWeb(
  href: string | null,
  missing: string,
  source: string
): OvieLauncherResolvedDestination {
  return { href: href ?? undefined, display: href ?? missing, configured: Boolean(href), source };
}

function resolvedWeb(
  raw: string | undefined,
  fallback: string,
  configuredSource: string,
  fallbackSource: string
): OvieLauncherResolvedDestination {
  const configured = originFromUrl(raw);
  return webOrigin(
    configured ?? fallback,
    configured ? configuredSource : fallbackSource,
    Boolean(configured)
  );
}

export function resolveLauncherDestination(
  definition: OvieLauncherDefinition,
  // biome-ignore format: compact config
  config: {
    readonly gbrainApiUrl?: string; readonly hermesWebUrl?: string;
    readonly symphonySshHost?: string; readonly githubOwner?: string;
    readonly githubRepo?: string; readonly productionOrigin?: string;
  }
): OvieLauncherResolvedDestination {
  const staticWeb = STATIC_WEB[definition.id];
  if (staticWeb) return webOrigin(staticWeb[0], staticWeb[1]);
  switch (definition.id) {
    case 'gbrain':
      return resolvedWeb(
        config.gbrainApiUrl,
        GBRAIN_HTTP_TEMPLATE_ORIGIN,
        'GBRAIN_API_URL',
        'gbrain HTTP template'
      );
    case 'hermes':
      return resolvedWeb(
        config.hermesWebUrl,
        HERMES_GATEWAY_TEMPLATE_ORIGIN,
        'HERMES_WEB_URL',
        'Hermes Air gateway template'
      );
    case 'symphony':
      return {
        sshHost: SYMPHONY_SSH_TEMPLATE_HOST,
        display: `ssh ${SYMPHONY_SSH_TEMPLATE_HOST}`,
        configured: true,
        source: 'documented Gem SSH alias',
      };
    case 'github-prs':
      return optionalWeb(
        githubPullsUrl(config.githubOwner, config.githubRepo),
        'GitHub PRs not configured',
        config.githubOwner || config.githubRepo
          ? 'HUD_GITHUB_OWNER/HUD_GITHUB_REPO'
          : 'desktop GitHub repo constants'
      );
    case 'production':
      return optionalWeb(
        originFromUrl(config.productionOrigin),
        'Production origin not configured',
        'NEXT_PUBLIC_APP_URL'
      );
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
  else if (status === 'unavailable' || status === 'error') {
    score += definition.loop === 'recover' ? 25 : -5;
  }
  if (timActionCount > 0) {
    if (definition.loop === 'review' || definition.loop === 'approve') {
      score += 30;
    }
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
    ...definition,
    status,
    rankScore: rankScoreForControl({ definition, status, timActionCount }),
    why: whyForControl({ definition, status, destination, timActionCount }),
    destinationDisplay: stripSecrets(destination.display),
    // biome-ignore format: compact control fields
    href: destination.href,
    sshHost: destination.sshHost,
    // biome-ignore format: compact search blob
    searchText: [
      definition.label, definition.id, definition.loop, definition.group,
      destination.display, ...definition.searchTerms,
    ].join(' ').toLowerCase(),
  };
}

function byRankThenLabel(a: OvieLauncherControl, b: OvieLauncherControl) {
  return b.rankScore !== a.rankScore
    ? b.rankScore - a.rankScore
    : a.label.localeCompare(b.label);
}

export function assertPrimaryRailInvariants(
  inventory: Pick<OvieLauncherInventory, 'primary'>
): void {
  const primaryIds = new Set(inventory.primary.map(control => control.id));
  const missing = OVIE_REQUIRED_PRIMARY_LAUNCHER_IDS.find(
    id => !primaryIds.has(id)
  );
  if (missing) {
    throw new OvieLauncherInvariantError(
      `Required human control "${missing}" is missing from the primary rail`
    );
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
  // biome-ignore format: compact dest map
  readonly destinations: Readonly<Record<string, OvieLauncherResolvedDestination>>;
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
    const readyish =
      destination.configured || destination.href || destination.sshHost;
    const status = definition.agentCliOnly
      ? 'not_configured'
      : (input.state.availability[definition.id] ??
        (readyish ? 'unavailable' : 'not_configured'));
    return buildLauncherControl({
      definition,
      destination,
      status,
      timActionCount: input.state.timActionCount,
    });
  });
  const rankedHuman = all
    .filter(
      c =>
        c.owner === 'human' &&
        !c.agentCliOnly &&
        (c.requiredOnPrimary || c.rankScore >= 60)
    )
    .toSorted(byRankThenLabel);
  const required = all.filter(c => c.requiredOnPrimary);
  const inventory: OvieLauncherInventory = {
    generatedAtIso: input.generatedAtIso ?? new Date(0).toISOString(),
    primary: [
      ...rankedHuman,
      ...required.filter(c => !rankedHuman.some(h => h.id === c.id)),
    ].toSorted(byRankThenLabel),
    advanced: all
      .filter(c => c.agentCliOnly || c.owner === 'agent')
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
