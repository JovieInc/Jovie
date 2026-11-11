import type { ConnectorStatus } from '@/lib/connectors/types';
import type { LibraryProfileItemKind } from '@/lib/library/profile-visibility';

declare const displayTextBrand: unique symbol;
/** A presenter's explicit output, never a domain row or an agent payload. */
export type DisplayText = string & { readonly [displayTextBrand]: true };

/** Heuristics for diagnostics, not a security filter or a name validator. */
export function machineTextReasons(text: string): readonly string[] {
  return Object.entries({
    json: /\{\s*"|"\s*:/,
    enum: /\b[a-z]+(?:_[a-z]+)+\b/,
    uuid: /\b[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\b/i,
    hex: /\b(?:0x[\da-f]+|[\da-f]{24,})\b/i,
    sentinel: /\b(?:undefined|null|NaN)\b/,
    prompt: /\bAs (?:Codex|an? agent)\b|dogfood-invariant-probe-/i,
  }).flatMap(([reason, pattern]) => (pattern.test(text) ? [reason] : []));
}

/** Explicit presentation boundary. No automatic enum prettifying or ID fallback. */
export function displayText(text: string): DisplayText {
  if (!text.trim()) throw new Error('Display text must not be empty');
  return text as DisplayText;
}

export interface DisplayModel {
  readonly title: DisplayText;
  readonly description?: DisplayText;
}

export interface DisplayPresenter<Domain> {
  toDisplay(value: Domain): DisplayModel;
}

interface AgentContextReference {
  readonly entityId: string;
  readonly profileId: string;
  readonly revision: string | null;
  readonly display: DisplayModel;
}

export type AgentContextAttachment = AgentContextReference &
  (
    | {
        readonly kind: 'library-item';
        readonly itemKind: LibraryProfileItemKind;
      }
    | { readonly kind: 'profile-surface' | 'connector' }
  );

/** References are untrusted input: the server must resolve ownership on use. */
export interface AgentContextRequest {
  readonly message: DisplayText;
  readonly contextAttachments: readonly AgentContextAttachment[];
}

/** Composer/history projection deliberately cannot include hidden references. */
export function toAgentRequestDisplay(request: AgentContextRequest) {
  return {
    message: request.message,
    attachments: request.contextAttachments.map(({ display }) => ({
      title: display.title,
      ...(display.description === undefined
        ? {}
        : { description: display.description }),
    })),
  };
}

/** Shared shape for Jovie and Ovie; existing registries still own their facts. */
export interface NomenclatureEntry<RouteId extends string = string> {
  readonly routeId: RouteId;
  readonly route: string;
  readonly noun: DisplayText;
  readonly navLabel: DisplayText;
  readonly title: DisplayText;
  readonly settingsLabel?: DisplayText;
  readonly parent: RouteId | null;
  readonly switcher: readonly RouteId[];
}

/** Validate ownership before a registry is offered to consumers. */
export function defineNomenclature<RouteId extends string>(
  entries: readonly NomenclatureEntry<RouteId>[]
): readonly NomenclatureEntry<RouteId>[] {
  const byId = new Map(entries.map(entry => [entry.routeId, entry]));
  if (byId.size !== entries.length) throw new Error('Duplicate route ID');
  if (new Set(entries.map(entry => entry.route)).size !== entries.length)
    throw new Error('Duplicate route ownership');
  for (const entry of entries) {
    for (const id of [entry.parent, ...entry.switcher]) {
      if (id !== null && !byId.has(id))
        throw new Error('Orphan route reference');
    }
    const seen = new Set<RouteId>();
    let current: NomenclatureEntry<RouteId> | undefined = entry;
    while (current) {
      if (seen.has(current.routeId)) throw new Error('Cyclic route parent');
      seen.add(current.routeId);
      current = current.parent === null ? undefined : byId.get(current.parent);
    }
  }
  return entries;
}

/** These facts cannot be substituted for each other, even for one provider. */
export type ConnectionFact =
  | {
      readonly kind: 'profile-link';
      readonly state: 'linked' | 'unlinked' | 'unknown';
    }
  | { readonly kind: 'account-connection'; readonly state: ConnectorStatus };

/** Entity owners supply one selector; UI and chat consume its same snapshot. */
export type StatusSelector<Snapshot, Fact> = (snapshot: Snapshot) => Fact;

export type StatusScope =
  | { readonly scope: 'row'; readonly isDefault: boolean }
  | {
      readonly scope: 'section' | 'page';
      readonly total: number;
      readonly exceptions: number;
    };

/** Presentation decision only; never recomputes the entity's underlying status. */
export function shouldAnnounceStatus(status: StatusScope): boolean {
  if (status.scope === 'row') return !status.isDefault;
  if (
    !Number.isInteger(status.total) ||
    !Number.isInteger(status.exceptions) ||
    status.total < 0 ||
    status.exceptions < 0 ||
    status.exceptions > status.total
  )
    throw new Error('Invalid status aggregate');
  return status.exceptions > 0;
}

export interface CopyableIdentifier {
  readonly kind: 'isrc' | 'upc' | 'sku' | 'slug' | 'url';
  readonly text: string;
  /** Full raw value, independently of truncation or display formatting. */
  readonly copyText: string;
}

/** Adapter for the existing DrawerPropertyRow copyable/copyText contract. */
export function identifierCopyProps(
  identifier: CopyableIdentifier,
  surface: 'text' | 'button' | 'select' | 'link'
) {
  return surface === 'text' && identifier.copyText.trim().length > 0
    ? { copyable: true, copyText: identifier.copyText }
    : { copyable: false };
}
