import type {
  ContactResponsibilityAssignment,
  DashboardContact,
} from '@/types/contacts';
import {
  createJovieDefaultManager,
  getSelectedResponsibility,
  hasActiveHumanManager,
  orderResponsibilities,
} from './directory';

export interface ContactDirectoryRecord {
  readonly person: {
    id: string;
    creatorProfileId: string;
    displayName: string | null;
    companyName: string | null;
    email: string | null;
    phone: string | null;
    preferredChannel: 'email' | 'phone' | null;
  };
  readonly assignment: {
    id: string;
    territories: string[] | null;
    isActive: boolean | null;
    isPrimary: boolean | null;
    sortOrder: number | null;
    startedAt: Date | null;
    endedAt: Date | null;
  } | null;
  readonly responsibility: {
    role: DashboardContact['role'];
    customLabel: string | null;
  } | null;
}

function toTimestamp(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function toAssignment(
  record: ContactDirectoryRecord
): ContactResponsibilityAssignment | null {
  if (!record.assignment || !record.responsibility) return null;

  return {
    id: record.assignment.id,
    role: record.responsibility.role,
    customLabel: record.responsibility.customLabel || null,
    territories: record.assignment.territories ?? [],
    isActive: record.assignment.isActive ?? true,
    isPrimary: record.assignment.isPrimary ?? false,
    sortOrder: record.assignment.sortOrder ?? 0,
    startedAt: toTimestamp(record.assignment.startedAt),
    endedAt: toTimestamp(record.assignment.endedAt),
  };
}

function toDashboardContact(
  person: ContactDirectoryRecord['person'],
  responsibilities: ContactResponsibilityAssignment[]
): DashboardContact {
  const ordered = orderResponsibilities(responsibilities);
  const selected = getSelectedResponsibility(ordered);

  return {
    id: person.id,
    creatorProfileId: person.creatorProfileId,
    role: selected?.role ?? 'other',
    customLabel: selected?.customLabel ?? null,
    personName: person.displayName,
    companyName: person.companyName,
    territories: selected?.territories ?? [],
    email: person.email,
    phone: person.phone,
    preferredChannel: person.preferredChannel,
    isActive: selected?.isActive ?? false,
    sortOrder: selected?.sortOrder ?? 0,
    responsibilities: ordered,
  };
}

/**
 * Groups joined people/assignment rows into directory entries. The stable
 * responsibility order is shared by the Contacts UI and Inbox assignment
 * selection, so multiple people under one responsibility resolve predictably.
 */
export function toDashboardContacts(
  records: readonly ContactDirectoryRecord[],
  creatorProfileId: string
): DashboardContact[] {
  const byPersonId = new Map<
    string,
    {
      person: ContactDirectoryRecord['person'];
      responsibilities: ContactResponsibilityAssignment[];
    }
  >();

  for (const record of records) {
    const current = byPersonId.get(record.person.id) ?? {
      person: record.person,
      responsibilities: [],
    };
    const assignment = toAssignment(record);
    if (assignment) current.responsibilities.push(assignment);
    byPersonId.set(record.person.id, current);
  }

  const contacts = [...byPersonId.values()]
    .map(({ person, responsibilities }) =>
      toDashboardContact(person, responsibilities)
    )
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      return left.id.localeCompare(right.id);
    });

  return hasActiveHumanManager(contacts)
    ? contacts
    : [...contacts, createJovieDefaultManager(creatorProfileId)];
}
