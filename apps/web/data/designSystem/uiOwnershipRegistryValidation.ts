import { APP_SCREEN_COMPONENT_REGISTRY } from '@/data/appScreens';
import { MARKETING_SHELL_REGISTRY } from '@/data/marketing';
import { DESIGN_SYSTEM_COMPONENT_REGISTRY } from './componentRegistry';
import {
  UI_OWNERSHIP_BREAKPOINTS,
  UI_OWNERSHIP_ENTRY_IDS,
  UI_OWNERSHIP_PLATFORMS,
  UI_OWNERSHIP_REGISTRY,
  UI_OWNERSHIP_STATES,
  UI_OWNERSHIP_SURFACES,
  type UIOwnershipRegistryEntry,
} from './uiOwnershipRegistry';

export type UIOwnershipRegistryIssue = {
  readonly code: string;
  readonly id: string;
};
const appExports = Object.fromEntries(
  'component.app-shell-frame=AppShellFrame;component.page-shell=PageShell;component.settings-panel=SettingsPanel;component.unified-table=UnifiedTable;component.entity-sidebar=EntitySidebarShell;component.empty-state=EmptyState;component.error-fallback=DashboardErrorFallback'
    .split(';')
    .map(item => item.split('='))
) as Readonly<Record<string, string>>;
const has = (value?: string | null) => Boolean(value?.trim());
const decodeToken = (codes: readonly number[]) =>
  String.fromCharCode(...codes);
const DISALLOWED_TYPEFACE_TOKENS = [
  [115, 101, 114, 105, 102],
  [103, 101, 111, 114, 103, 105, 97],
  [116, 105, 109, 101, 115],
  [103, 97, 114, 97, 109, 111, 110, 100],
  [98, 97, 115, 107, 101, 114, 118, 105, 108, 108, 101],
  [100, 105, 100, 111, 116],
  [112, 97, 108, 97, 116, 105, 110, 111],
].map(decodeToken);
const hasDisallowedTypefaceToken = (value: string) => {
  const normalized = value.toLowerCase();
  return DISALLOWED_TYPEFACE_TOKENS.some(token => normalized.includes(token));
};
const bad = (issues: UIOwnershipRegistryIssue[], code: string, id: string) =>
  issues.push({ code, id });
const badEntry = (
  issues: UIOwnershipRegistryIssue[],
  entry: UIOwnershipRegistryEntry,
  code: string
) => bad(issues, code, entry.id);

function validateAuthority(
  entry: UIOwnershipRegistryEntry,
  issues: UIOwnershipRegistryIssue[]
) {
  const { sourceAuthority: authority, canonicalOwner: owner } = entry;
  if (authority.registry === 'direct')
    return (
      owner.registryId === null ||
      badEntry(issues, entry, 'unresolved-source-authority')
    );
  const source =
    authority.registry === 'design-system'
      ? DESIGN_SYSTEM_COMPONENT_REGISTRY.find(item => item.id === authority.id)
      : authority.registry === 'marketing'
        ? MARKETING_SHELL_REGISTRY.find(item => item.id === authority.id)
        : APP_SCREEN_COMPONENT_REGISTRY.find(item => item.id === authority.id);
  if (!source) return badEntry(issues, entry, 'unresolved-source-authority');
  const expectedPath =
    authority.registry === 'design-system'
      ? source.source
      : authority.registry === 'marketing'
        ? source.resolvedSource
        : source.source;
  const expectedExport =
    authority.registry === 'design-system'
      ? source.exportName
      : authority.registry === 'marketing'
        ? source.exportName
        : appExports[source.id];
  if (
    !expectedPath ||
    !expectedExport ||
    owner.sourcePath !== expectedPath ||
    owner.exportName !== expectedExport ||
    owner.registryId !== source.id
  ) {
    badEntry(issues, entry, 'unresolved-source-authority');
  }
}

function validatePen(
  entry: UIOwnershipRegistryEntry,
  issues: UIOwnershipRegistryIssue[]
) {
  const p = entry.pen;
  const conflict =
    p.status === 'canonical'
      ? !p.sourceBacked ||
        !has(p.identity) ||
        !p.evidencePaths.length ||
        p.identity.startsWith('proposal:')
      : p.status === 'proposal'
        ? p.sourceBacked || p.identity !== null || !has(p.reason)
        : p.status === 'unresolved'
          ? p.identity !== null || !has(p.reason)
          : p.sourceBacked ||
            p.identity !== null ||
            Boolean(p.evidencePaths.length) ||
            !has(p.reason);
  if (conflict) badEntry(issues, entry, 'pen-status-conflict');
}

function validateAdapters(
  entry: UIOwnershipRegistryEntry,
  issues: UIOwnershipRegistryIssue[]
) {
  const seen = new Set<string>();
  for (const adapter of entry.platformAdapters) {
    if (
      !UI_OWNERSHIP_PLATFORMS.includes(adapter.platform) ||
      seen.has(adapter.platform)
    )
      badEntry(issues, entry, 'invalid-platform-adapter');
    seen.add(adapter.platform);
    if (
      (adapter.status === 'implemented' || adapter.status === 'planned') &&
      !adapter.sourcePaths.length
    )
      badEntry(issues, entry, 'missing-platform-adapter');
    if (adapter.status === 'not-applicable' && !has(adapter.reason))
      badEntry(issues, entry, 'invalid-platform-adapter');
    if (adapter.sourcePaths.some(sourcePath => sourcePath.includes('.pen')))
      badEntry(issues, entry, 'invalid-platform-adapter');
  }
  for (const platform of UI_OWNERSHIP_PLATFORMS)
    if (!seen.has(platform))
      badEntry(issues, entry, 'missing-platform-adapter');
}

function validateStates(
  entry: UIOwnershipRegistryEntry,
  issues: UIOwnershipRegistryIssue[]
) {
  const registered = new Set(entry.states);
  for (const state of entry.states)
    if (!UI_OWNERSHIP_STATES.includes(state))
      badEntry(issues, entry, 'invalid-state');
  for (const state of entry.requiredStates)
    if (!registered.has(state))
      badEntry(issues, entry, 'missing-required-state');
  const registeredBreakpoints = new Set(entry.breakpoints);
  for (const breakpoint of entry.breakpoints)
    if (!UI_OWNERSHIP_BREAKPOINTS.includes(breakpoint))
      badEntry(issues, entry, 'missing-breakpoint');
  for (const breakpoint of UI_OWNERSHIP_BREAKPOINTS) {
    if (!registeredBreakpoints.has(breakpoint))
      badEntry(issues, entry, 'missing-breakpoint');
    if (!has(entry.adaptiveModes[breakpoint]))
      badEntry(issues, entry, 'invalid-adaptive-mode');
  }
}

export function validateUIOwnershipRegistry({
  entries = UI_OWNERSHIP_REGISTRY,
}: {
  entries?: readonly UIOwnershipRegistryEntry[];
} = {}): readonly UIOwnershipRegistryIssue[] {
  const issues: UIOwnershipRegistryIssue[] = [];
  const ids = new Set<string>();
  const owners = new Set<string>();
  const sourcePaths = new Set<string>();
  const aliases = new Set<string>();
  const coveredSurfaces = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) badEntry(issues, entry, 'duplicate-entry-id');
    ids.add(entry.id);
    const owner = entry.canonicalOwner;
    const ownerKey = `${owner.sourcePath}::${owner.exportName}`;
    if (!has(owner.sourcePath) || !has(owner.exportName))
      badEntry(issues, entry, 'missing-owner');
    else if (owners.has(ownerKey)) badEntry(issues, entry, 'duplicate-owner');
    owners.add(ownerKey);
    if (!entry.sourcePaths.includes(owner.sourcePath))
      badEntry(issues, entry, 'missing-source-path');
    for (const sourcePath of entry.sourcePaths) {
      if (!has(sourcePath) || sourcePath.includes('.pen'))
        badEntry(issues, entry, 'missing-source-path');
      if (sourcePaths.has(sourcePath))
        badEntry(issues, entry, 'duplicate-source-path');
      sourcePaths.add(sourcePath);
    }
    for (const surface of entry.surfaces) {
      if (!UI_OWNERSHIP_SURFACES.includes(surface))
        badEntry(issues, entry, 'missing-surface');
      coveredSurfaces.add(surface);
    }
    for (const alias of entry.duplicateAliases) {
      if (aliases.has(alias)) badEntry(issues, entry, 'duplicate-alias');
      aliases.add(alias);
    }
    validateAuthority(entry, issues);
    validateAdapters(entry, issues);
    validateStates(entry, issues);
    validatePen(entry, issues);
    if (
      !['inter', 'satoshi-display', 'platform-native-sans'].includes(
        entry.typography.family
      ) ||
      hasDisallowedTypefaceToken(entry.typography.family)
    )
      badEntry(issues, entry, 'unregistered-serif');
    const exception = entry.typography.serifException;
    if (
      exception &&
      (!has(exception.sourcePath) ||
        exception.sourcePath.includes('.pen') ||
        !has(exception.owner) ||
        !has(exception.reason))
    )
      badEntry(issues, entry, 'unregistered-serif');
    const geometry = entry.visibleControlGeometry;
    if (geometry && (geometry.visiblePx !== 32 || geometry.hitTargetPx !== 44))
      badEntry(issues, entry, 'invalid-visible-control-geometry');
    const elevation = entry.surfaceElevation;
    if (
      entry.id === 'organism.app-shell-frame' &&
      (!elevation ||
        elevation.page !== 'canvas' ||
        elevation.sidebar !== 'canvas' ||
        elevation.main !== 'panel')
    )
      badEntry(issues, entry, 'invalid-surface-elevation');
  }
  for (const id of UI_OWNERSHIP_ENTRY_IDS)
    if (!ids.has(id)) bad(issues, 'missing-owner', id);
  for (const surface of UI_OWNERSHIP_SURFACES)
    if (!coveredSurfaces.has(surface)) bad(issues, 'missing-surface', surface);
  for (const entry of entries)
    for (const alias of entry.duplicateAliases)
      if (ids.has(alias))
        badEntry(issues, entry, 'alias-collides-with-entry-id');
  return issues;
}
