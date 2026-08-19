import { ovieIssuerSecret, signPayload, verifyPayload } from './oauth';
import type { OvieDecision, OvieInitiative } from './types';

export type OperatingStore = {
  putDecision(record: OvieDecision): void;
  getDecision(id: string): OvieDecision | undefined;
  listDecisions(): readonly OvieDecision[];
  putInitiative(record: OvieInitiative): void;
  getInitiative(id: string): OvieInitiative | undefined;
  listInitiatives(): readonly OvieInitiative[];
};

type CompactInitiative = {
  readonly t: 'i';
  readonly title: string;
  readonly intent: string;
  readonly status: OvieInitiative['status'];
  readonly lane: OvieInitiative['lane'];
  readonly dest: OvieInitiative['destination'];
  readonly created: string;
};

type CompactDecision = {
  readonly t: 'd';
  readonly decided: string;
  readonly created: string;
};

const CLIP = 180;

function clip(value: string): string {
  return value.length <= CLIP ? value : value.slice(0, CLIP);
}

export function sealId(prefix: 'ini' | 'dec', record: unknown): string {
  if (prefix === 'ini') {
    const initiative = record as OvieInitiative;
    const compact: CompactInitiative = {
      t: 'i',
      title: clip(initiative.handoff.title),
      intent: clip(initiative.handoff.intent),
      status: initiative.status,
      lane: initiative.lane,
      dest: initiative.destination,
      created: initiative.createdAt,
    };
    return `${prefix}_${signPayload(ovieIssuerSecret(), compact)}`;
  }
  const decision = record as OvieDecision;
  const compact: CompactDecision = {
    t: 'd',
    decided: clip(decision.decided),
    created: decision.createdAt,
  };
  return `${prefix}_${signPayload(ovieIssuerSecret(), compact)}`;
}

function unsealInitiative(id: string): OvieInitiative | undefined {
  if (!id.startsWith('ini_')) return undefined;
  const draft = verifyPayload<CompactInitiative | Omit<OvieInitiative, 'id'>>(
    ovieIssuerSecret(),
    id.slice(4)
  );
  if (!draft) return undefined;
  if ('t' in draft && draft.t === 'i') {
    return {
      id,
      kind: 'initiative',
      status: draft.status,
      handoff: { title: draft.title, intent: draft.intent },
      lane: draft.lane,
      destination: draft.dest,
      receipts: [],
      workerSpawned: false,
      createdAt: draft.created,
      updatedAt: draft.created,
      evidence: [],
    };
  }
  if ('kind' in draft && draft.kind === 'initiative') {
    return { ...draft, id };
  }
  return undefined;
}

function unsealDecision(id: string): OvieDecision | undefined {
  if (!id.startsWith('dec_')) return undefined;
  const draft = verifyPayload<CompactDecision | Omit<OvieDecision, 'id'>>(
    ovieIssuerSecret(),
    id.slice(4)
  );
  if (!draft) return undefined;
  if ('t' in draft && draft.t === 'd') {
    return {
      id,
      kind: 'decision',
      decided: draft.decided,
      createdAt: draft.created,
    };
  }
  if ('kind' in draft && draft.kind === 'decision') {
    return { ...draft, id };
  }
  return undefined;
}

export class MemoryOperatingStore implements OperatingStore {
  private readonly decisions = new Map<string, OvieDecision>();
  private readonly initiatives = new Map<string, OvieInitiative>();

  putDecision(record: OvieDecision): void {
    this.decisions.set(record.id, record);
  }

  getDecision(id: string): OvieDecision | undefined {
    return this.decisions.get(id) ?? unsealDecision(id);
  }

  listDecisions(): readonly OvieDecision[] {
    return [...this.decisions.values()];
  }

  putInitiative(record: OvieInitiative): void {
    this.initiatives.set(record.id, record);
  }

  getInitiative(id: string): OvieInitiative | undefined {
    return this.initiatives.get(id) ?? unsealInitiative(id);
  }

  listInitiatives(): readonly OvieInitiative[] {
    return [...this.initiatives.values()];
  }
}

const globalStore = new MemoryOperatingStore();

export function getDefaultOperatingStore(): OperatingStore {
  return globalStore;
}
