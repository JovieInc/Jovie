export const DESKTOP_BUILD_IDENTITY_UNAVAILABLE = 'unavailable';
export const DESKTOP_BUILD_IDENTITY_PRINT_FLAG = '--print-build-identity';
export const DESKTOP_BUILD_IDENTITY_RESOURCE_NAME = 'build-identity.json';
export const DESKTOP_BUILD_IDENTITY_COPY_CONTROL_ID = 'copy-build-identity';
export const DESKTOP_BUILD_IDENTITY_TEST_ID = 'desktop-build-identity';
export const DESKTOP_BUILD_IDENTITY_STATUS_TEST_ID =
  'desktop-build-identity-status';
export const DESKTOP_BUILD_IDENTITY_JSON_SCRIPT_ID =
  'jovie-desktop-build-identity';

const FULL_SHA = /^[0-9a-f]{40}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const STAGING_SEMVER = /^\d+\.\d+\.\d+-staging\.[1-9]\d*\.[1-9]\d*$/;
const KEYS = ['channel', 'version', 'sourceRevision', 'builtAt'] as const;
const CHANNELS = new Set(['production', 'staging', 'local']);

export type DesktopReleaseChannel = 'production' | 'staging' | 'local';
export type DesktopBuildProvenance = 'verified' | 'development' | 'unverified';

export interface DesktopBuildIdentityRecord {
  readonly channel: DesktopReleaseChannel;
  readonly version: string;
  readonly sourceRevision: string | null;
  readonly builtAt: string | null;
}

export interface ResolvedDesktopBuildIdentity
  extends DesktopBuildIdentityRecord {
  readonly provenance: DesktopBuildProvenance;
}

function isChannel(value: unknown): value is DesktopReleaseChannel {
  return typeof value === 'string' && CHANNELS.has(value);
}
function isSha(value: unknown): value is string {
  return typeof value === 'string' && FULL_SHA.test(value);
}
function isVersionForChannel(
  channel: DesktopReleaseChannel,
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    (channel === 'staging' ? STAGING_SEMVER : SEMVER).test(value)
  );
}
function isIso(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

export function parseDesktopBuildIdentityRecord(
  value: unknown
): DesktopBuildIdentityRecord | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== KEYS.length || KEYS.some(key => !keys.includes(key))) {
    return null;
  }
  if (
    !isChannel(record.channel) ||
    !isVersionForChannel(record.channel, record.version)
  )
    return null;
  if (record.sourceRevision !== null && !isSha(record.sourceRevision)) {
    return null;
  }
  if (record.builtAt !== null && !isIso(record.builtAt)) return null;
  return {
    channel: record.channel,
    version: record.version,
    sourceRevision: record.sourceRevision,
    builtAt: record.builtAt,
  };
}

function recordsEqual(
  left: DesktopBuildIdentityRecord,
  right: DesktopBuildIdentityRecord
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function bakedIdentityMeetsPackagedProvenance(
  record: DesktopBuildIdentityRecord
): boolean {
  return (
    (record.channel === 'production' || record.channel === 'staging') &&
    isVersionForChannel(record.channel, record.version) &&
    isSha(record.sourceRevision) &&
    isIso(record.builtAt)
  );
}

export function resolveDesktopBuildIdentity(input: {
  readonly baked: unknown;
  readonly runtimeChannel: DesktopReleaseChannel;
  readonly runtimeVersion: string;
  readonly packaged: boolean;
  readonly packagedRecord: unknown;
}): ResolvedDesktopBuildIdentity {
  const baked = parseDesktopBuildIdentityRecord(input.baked);
  if (!baked) {
    return {
      channel: input.runtimeChannel,
      version: isVersionForChannel(input.runtimeChannel, input.runtimeVersion)
        ? input.runtimeVersion
        : '0.0.0',
      sourceRevision: null,
      builtAt: null,
      provenance: 'unverified',
    };
  }

  const packagedRecord = input.packaged
    ? parseDesktopBuildIdentityRecord(input.packagedRecord)
    : null;

  if (
    input.packaged &&
    (baked.channel === 'production' || baked.channel === 'staging')
  ) {
    if (packagedRecord === null || !recordsEqual(baked, packagedRecord)) {
      return { ...baked, provenance: 'unverified' };
    }
  }

  if (
    baked.channel !== input.runtimeChannel ||
    baked.version !== input.runtimeVersion
  ) {
    return { ...baked, provenance: 'unverified' };
  }

  if (!input.packaged || baked.channel === 'local') {
    return {
      channel: baked.channel,
      version: baked.version,
      sourceRevision: isSha(baked.sourceRevision) ? baked.sourceRevision : null,
      builtAt: null,
      provenance: 'development',
    };
  }

  if (!bakedIdentityMeetsPackagedProvenance(baked)) {
    return { ...baked, provenance: 'unverified' };
  }

  return { ...baked, provenance: 'verified' };
}

export function formatDesktopBuildIdentityDisplay(
  identity: ResolvedDesktopBuildIdentity
): string {
  const provenance =
    identity.provenance === 'verified'
      ? 'verified'
      : identity.provenance === 'development'
        ? 'development (build time unavailable)'
        : 'unverified';
  return [
    `channel: ${identity.channel}`,
    `version: ${identity.version}`,
    `revision: ${identity.sourceRevision ?? DESKTOP_BUILD_IDENTITY_UNAVAILABLE}`,
    `built: ${identity.builtAt ?? DESKTOP_BUILD_IDENTITY_UNAVAILABLE}`,
    `provenance: ${provenance}`,
  ].join('\n');
}

export function toDesktopBuildIdentityJson(
  identity: ResolvedDesktopBuildIdentity
): string {
  return `${JSON.stringify({
    channel: identity.channel,
    version: identity.version,
    sourceRevision: identity.sourceRevision,
    builtAt: identity.builtAt,
    provenance: identity.provenance,
  })}\n`;
}

function escapeHtmlText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderDesktopBuildIdentitySection(
  identity: ResolvedDesktopBuildIdentity
): string {
  const visible = escapeHtmlText(formatDesktopBuildIdentityDisplay(identity));
  const json = escapeHtmlText(toDesktopBuildIdentityJson(identity).trim());
  return `<section class="identity" data-testid="${DESKTOP_BUILD_IDENTITY_TEST_ID}" data-provenance="${identity.provenance}" aria-label="Build identity"><pre>${visible}</pre><script type="application/json" id="${DESKTOP_BUILD_IDENTITY_JSON_SCRIPT_ID}">${json}</script><div class="identity-actions"><button type="button" class="identity-copy" id="${DESKTOP_BUILD_IDENTITY_COPY_CONTROL_ID}" data-testid="desktop-build-identity-copy" aria-label="Copy build identity">Copy identity</button><p class="identity-status" id="${DESKTOP_BUILD_IDENTITY_STATUS_TEST_ID}" data-testid="${DESKTOP_BUILD_IDENTITY_STATUS_TEST_ID}" aria-live="polite"></p></div></section><script>(function(){var b=document.getElementById(${JSON.stringify(DESKTOP_BUILD_IDENTITY_COPY_CONTROL_ID)});var s=document.getElementById(${JSON.stringify(DESKTOP_BUILD_IDENTITY_STATUS_TEST_ID)});var n=document.querySelector('[data-testid="${DESKTOP_BUILD_IDENTITY_TEST_ID}"] pre');if(!b||!n)return;b.addEventListener('click',function(){var ok=false;try{var a=document.createElement('textarea');a.value=n.textContent||'';a.setAttribute('readonly','');a.style.position='fixed';a.style.left='-9999px';document.body.appendChild(a);a.select();ok=document.execCommand('copy');a.remove();}catch(e){ok=false;}if(s)s.textContent=ok?'Copied':'Copy failed';});})();</script>`;
}

export const DESKTOP_BUILD_IDENTITY_SHELL_CSS =
  '.identity{position:relative;display:grid;gap:10px;justify-items:center;min-height:8.75em}.identity pre{margin:0;min-height:6.2em;max-width:42ch;color:var(--system-b-text-secondary);font-size:11px;line-height:1.55;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;text-align:left;white-space:pre-wrap;overflow-wrap:anywhere}.identity-actions{display:grid;justify-items:center;gap:4px;min-height:3.4em}button.identity-copy{display:inline-flex;height:34px;min-width:9.5em;align-items:center;justify-content:center;border:0;border-radius:var(--system-b-radius-pill);padding:0 13px;background:transparent;color:var(--system-b-text-secondary);font:inherit;font-size:12px;font-weight:590;cursor:pointer}button.identity-copy:focus-visible{outline:2px solid var(--system-b-text-primary);outline-offset:2px}.identity-status{min-height:1.2em;margin:0;color:var(--system-b-text-secondary);font-size:11px;line-height:1.2}@media (prefers-reduced-motion:reduce){button.identity-copy{transition:none}}';
