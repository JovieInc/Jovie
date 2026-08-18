import type { ContactRole } from '@/types/contacts';

export interface ContactAssignmentCandidate {
  readonly personId: string;
  readonly displayName: string | null;
  readonly role: ContactRole;
  readonly territories: readonly string[];
  readonly isPrimary: boolean;
  readonly sortOrder: number;
}

function territorySpecificity(
  territories: readonly string[],
  territory: string | null
): number {
  if (!territory) return 0;
  const normalizedTerritory = territory.trim().toLowerCase();
  if (!normalizedTerritory) return 0;
  if (territories.length === 0) return 1;
  if (
    territories.some(
      value => value.trim().toLowerCase() === normalizedTerritory
    )
  ) {
    return 2;
  }
  return territories.some(value => value.trim().toLowerCase() === 'worldwide')
    ? 1
    : 0;
}

/**
 * Picks an internal assignment without sending or forwarding correspondence.
 * The sort order is a user-visible contract: exact territory, then an
 * unscoped/Worldwide assignment, primary flag, explicit position, then name
 * and id as stable final tie-breakers. A region-specific assignment is never
 * selected outside its declared territory.
 */
export function selectContactAssignment(
  candidates: readonly ContactAssignmentCandidate[],
  territory: string | null
): ContactAssignmentCandidate | null {
  const eligible = territory?.trim()
    ? candidates.filter(
        candidate => territorySpecificity(candidate.territories, territory) > 0
      )
    : candidates;

  return (
    [...eligible].sort((left, right) => {
      const territoryOrder =
        territorySpecificity(right.territories, territory) -
        territorySpecificity(left.territories, territory);
      if (territoryOrder !== 0) return territoryOrder;
      if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      const leftName = left.displayName ?? '';
      const rightName = right.displayName ?? '';
      if (leftName !== rightName) return leftName < rightName ? -1 : 1;
      return left.personId.localeCompare(right.personId);
    })[0] ?? null
  );
}
