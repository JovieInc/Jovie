/** A projection of canonical domain state, never a second approval authority. */
export const INTERACTION_CASE_CONTRACT = 'jovie.interaction-case/v1' as const;

export interface InteractionCase {
  readonly contract: typeof INTERACTION_CASE_CONTRACT;
  readonly id: string;
  readonly kind:
    | 'support'
    | 'onboarding'
    | 'certification'
    | 'autonomous_action'
    | 'portfolio'
    | 'design'
    | 'spend';
  readonly source: {
    readonly system: string;
    readonly id: string;
    readonly revision: string | null;
  };
  readonly title: string;
  readonly recommendation: string;
  readonly owner: string | null;
  readonly state: 'needs_you' | 'active' | 'waiting' | 'disposed';
  readonly priority: number;
  readonly createdAt: string;
  readonly nextAction: string | null;
  readonly waitingUntil: string | null;
  readonly confidence: number | null;
  readonly evidence: readonly string[];
}

/** Urgency first, oldest waiting decision next; stable IDs break ties. */
export function rankInteractionCases<T extends InteractionCase>(
  cases: readonly T[]
): T[] {
  return cases
    .filter(item => item.state === 'needs_you')
    .toSorted(
      (a, b) =>
        a.priority - b.priority ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id)
    );
}
