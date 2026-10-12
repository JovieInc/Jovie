import type {
  ConnectionStatus,
  PresenceSignal,
  ProfileWorkspaceRow,
} from '@/components/features/presence/types';
import {
  type ConnectionPrimaryAction,
  getConnectionPrimaryAction,
  getConnectionStatus,
  getPresenceSignals,
} from './workspace';

/**
 * Presence inspector content model (JOV-6170 / JOV-8106).
 *
 * The canonical entity inspector answers four questions in a fixed order:
 * 1. identity — What is this object? (the sticky entity header)
 * 2. evidence — What did Jovie observe? (status, signals, source evidence)
 * 3. next_action — Why does it matter, who acts next? (identity check, verbs)
 * 4. metadata — secondary facts that support, never lead.
 *
 * The rail renders `sections` in array order, so the contract lives here —
 * never reorder section blocks in the component.
 */
export const PRESENCE_INSPECTOR_GROUPS = [
  'identity',
  'evidence',
  'next_action',
  'metadata',
] as const;

export type PresenceInspectorGroup = (typeof PRESENCE_INSPECTOR_GROUPS)[number];

export type PresenceInspectorSectionKey =
  /** evidence — measured status + search rank summary card. */
  | 'observation_summary'
  /** evidence — what Jovie observed at the public source. */
  | 'source_identity'
  /** evidence — separated signal primitives for this object. */
  | 'signals'
  /** next_action — the artist confirms a suggested/conflicting identity. */
  | 'identity_check'
  /** next_action — open / review / connect / upgrade verbs. */
  | 'actions'
  /** metadata — object type and monitoring state facts. */
  | 'object_facts'
  /** metadata — collapsed outage diagnostics disclosure. */
  | 'monitoring_details';

export interface PresenceInspectorSection {
  readonly key: PresenceInspectorSectionKey;
  readonly group: Exclude<PresenceInspectorGroup, 'identity'>;
}

export interface PresenceInspectorModel {
  readonly status: ConnectionStatus;
  readonly signals: readonly PresenceSignal[];
  readonly primaryAction: ConnectionPrimaryAction;
  /** Whether the artist must answer the identity question before anything else. */
  readonly needsIdentityDecision: boolean;
  /** Body sections in canonical render order; identity is the entity header. */
  readonly sections: readonly PresenceInspectorSection[];
}

export function derivePresenceInspector(
  row: ProfileWorkspaceRow,
  providerAvailable = true
): PresenceInspectorModel {
  const status = getConnectionStatus(row, providerAvailable);
  const searchUnavailable = status.label === 'Search Unavailable';
  const needsIdentityDecision =
    row.rowType === 'surface' &&
    (row.qualificationStatus === 'suggested' ||
      row.qualificationStatus === 'conflicting');

  const sections: PresenceInspectorSection[] = [];

  // Evidence first: what Jovie measured, what it observed at the source,
  // then the findings/recommendations that say why it matters.
  if (!searchUnavailable) {
    sections.push({ key: 'observation_summary', group: 'evidence' });
  }
  if (row.rowType === 'surface' && row.kind !== 'jovie') {
    sections.push({ key: 'source_identity', group: 'evidence' });
  }
  if (!searchUnavailable) {
    sections.push({ key: 'signals', group: 'evidence' });
  }
  if (needsIdentityDecision) {
    sections.push({ key: 'identity_check', group: 'next_action' });
  }
  sections.push({ key: 'actions', group: 'next_action' });
  if (searchUnavailable) {
    sections.push({ key: 'monitoring_details', group: 'metadata' });
  } else {
    sections.push({ key: 'object_facts', group: 'metadata' });
  }

  return {
    status,
    signals: getPresenceSignals(row, providerAvailable),
    primaryAction: getConnectionPrimaryAction(row),
    needsIdentityDecision,
    sections,
  };
}
