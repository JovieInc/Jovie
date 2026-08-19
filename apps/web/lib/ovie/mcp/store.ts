import type { OvieDecision, OvieInitiative } from './types';

export type OperatingStore = {
  putDecision(record: OvieDecision): void;
  getDecision(id: string): OvieDecision | undefined;
  listDecisions(): readonly OvieDecision[];
  putInitiative(record: OvieInitiative): void;
  getInitiative(id: string): OvieInitiative | undefined;
  listInitiatives(): readonly OvieInitiative[];
};

export class MemoryOperatingStore implements OperatingStore {
  private readonly decisions = new Map<string, OvieDecision>();
  private readonly initiatives = new Map<string, OvieInitiative>();

  putDecision(record: OvieDecision): void {
    this.decisions.set(record.id, record);
  }

  getDecision(id: string): OvieDecision | undefined {
    return this.decisions.get(id);
  }

  listDecisions(): readonly OvieDecision[] {
    return [...this.decisions.values()];
  }

  putInitiative(record: OvieInitiative): void {
    this.initiatives.set(record.id, record);
  }

  getInitiative(id: string): OvieInitiative | undefined {
    return this.initiatives.get(id);
  }

  listInitiatives(): readonly OvieInitiative[] {
    return [...this.initiatives.values()];
  }
}

const globalStore = new MemoryOperatingStore();

export function getDefaultOperatingStore(): OperatingStore {
  return globalStore;
}
