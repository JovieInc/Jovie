import type {
  ContactResponsibilityAssignment,
  DashboardContact,
} from '@/types/contacts';

/**
 * A product-defined contact assignment, not a copied user record. Keeping it
 * explicit makes the fallback visible without creating duplicate data.
 */
export const JOVIE_DEFAULT_MANAGER_ASSIGNMENT_ID =
  'system:jovie-default-manager';

export function orderResponsibilities(
  responsibilities: readonly ContactResponsibilityAssignment[]
): ContactResponsibilityAssignment[] {
  return [...responsibilities].sort((left, right) => {
    if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
    if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }
    return left.id.localeCompare(right.id);
  });
}

export function getSelectedResponsibility(
  responsibilities: readonly ContactResponsibilityAssignment[]
): ContactResponsibilityAssignment | null {
  return orderResponsibilities(responsibilities)[0] ?? null;
}

export function hasActiveHumanManager(
  contacts: readonly DashboardContact[]
): boolean {
  return contacts.some(
    contact =>
      !contact.isSystemDefault &&
      (contact.responsibilities ?? []).some(
        responsibility =>
          responsibility.isActive && responsibility.role === 'management'
      )
  );
}

export function createJovieDefaultManager(
  creatorProfileId: string
): DashboardContact {
  const responsibility: ContactResponsibilityAssignment = {
    id: JOVIE_DEFAULT_MANAGER_ASSIGNMENT_ID,
    role: 'management',
    customLabel: null,
    territories: [],
    isActive: true,
    isPrimary: true,
    sortOrder: Number.MAX_SAFE_INTEGER,
    startedAt: null,
    endedAt: null,
  };

  return {
    id: JOVIE_DEFAULT_MANAGER_ASSIGNMENT_ID,
    creatorProfileId,
    role: responsibility.role,
    customLabel: responsibility.customLabel,
    personName: 'Jovie',
    companyName: 'Jovie',
    territories: responsibility.territories,
    email: null,
    phone: null,
    preferredChannel: null,
    isActive: true,
    sortOrder: responsibility.sortOrder,
    responsibilities: [responsibility],
    isSystemDefault: true,
  };
}
