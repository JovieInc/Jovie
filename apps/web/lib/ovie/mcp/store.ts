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

export function sealId(prefix: 'ini' | 'dec', record: unknown): string {
  return `${prefix}_${signPayload(ovieIssuerSecret(), record)}`;
}

function unseal<T extends { id: string }>(
  prefix: 'ini' | 'dec',
  id: string
): T | undefined {
  if (!id.startsWith(`${prefix}_`)) return undefined;
  const draft = verifyPayload<Omit<T, 'id'>>(
    ovieIssuerSecret(),
    id.slice(prefix.length + 1)
  );
  return draft ? ({ ...draft, id } as T) : undefined;
}

export class MemoryOperatingStore implements OperatingStore {
  private readonly decisions = new Map<string, OvieDecision>();
  private readonly initiatives = new Map<string, OvieInitiative>();

  putDecision(record: OvieDecision): void {
    this.decisions.set(record.id, record);
  }

  getDecision(id: string): OvieDecision | undefined {
    return this.decisions.get(id) ?? unseal<OvieDecision>('dec', id);
  }

  listDecisions(): readonly OvieDecision[] {
    return [...this.decisions.values()];
  }

  putInitiative(record: OvieInitiative): void {
    this.initiatives.set(record.id, record);
  }

  getInitiative(id: string): OvieInitiative | undefined {
    return this.initiatives.get(id) ?? unseal<OvieInitiative>('ini', id);
  }

  listInitiatives(): readonly OvieInitiative[] {
    return [...this.initiatives.values()];
  }
}

const globalStore = new MemoryOperatingStore();

export function getDefaultOperatingStore(): OperatingStore {
  return globalStore;
}
