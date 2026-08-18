import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { resolveContactsWorkspaceTab } from '@/app/app/(shell)/contacts/contacts-workspace';
import { ContactDeleteConfirmDialog } from '@/features/dashboard/molecules/ContactDeleteConfirmDialog';
import { ContactListRow } from '@/features/dashboard/molecules/ContactListRow';
import type { EditableContact } from '@/types/contacts';

const WEB_ROOT = join(__dirname, '../../..');

const contact: EditableContact = {
  id: 'contact-1',
  creatorProfileId: 'profile-1',
  role: 'press',
  customLabel: null,
  personName: 'Riley Press',
  companyName: null,
  territories: [],
  email: 'riley@example.com',
  phone: null,
  preferredChannel: 'email',
  isActive: true,
  sortOrder: 0,
};

function readWeb(rel: string): string {
  return readFileSync(join(WEB_ROOT, rel), 'utf8');
}

describe('Contacts authenticated-surface evals', () => {
  it('resolves Contacts and Audience workspace tabs from the shipped page', () => {
    expect(resolveContactsWorkspaceTab('audience')).toBe('audience');
    expect(resolveContactsWorkspaceTab('contacts')).toBe('contacts');
    expect(resolveContactsWorkspaceTab(undefined)).toBe('contacts');
  });

  it('covers delete-confirm closed and open surfaces from the shipped dialog', () => {
    const { rerender } = render(
      <ContactDeleteConfirmDialog
        contact={null}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />
    );
    expect(
      screen.queryByRole('heading', { name: 'Delete Contact' })
    ).not.toBeInTheDocument();

    rerender(
      <ContactDeleteConfirmDialog
        contact={contact}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />
    );
    expect(
      screen.getByRole('heading', { name: 'Delete Contact' })
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute(
      'data-destructive',
      'true'
    );
  });

  it('covers compact list selected and unselected surfaces from the shipped row', () => {
    const { rerender } = render(
      <ContactListRow
        contact={contact}
        isSelected={false}
        onClick={() => undefined}
      />
    );
    expect(screen.getByRole('button', { pressed: false })).toHaveTextContent(
      'Press'
    );

    rerender(
      <ContactListRow contact={contact} isSelected onClick={() => undefined} />
    );
    expect(screen.getByRole('button', { pressed: true })).toHaveTextContent(
      'Riley Press'
    );
  });

  it('keeps Contacts manager, settings, and table on the same primitives', () => {
    const manager = readWeb(
      'components/features/dashboard/organisms/ContactsManager.tsx'
    );
    const settings = readWeb(
      'components/features/dashboard/organisms/SettingsContactsSection.tsx'
    );
    const table = readWeb(
      'components/features/dashboard/organisms/contacts-table/ContactsTable.tsx'
    );
    const pageClient = readWeb(
      'app/app/(shell)/contacts/ContactsPageClient.tsx'
    );
    const settingsPage = readWeb(
      'app/app/(shell)/settings/contacts/ContactsContent.tsx'
    );

    expect(manager).toContain('ContactDeleteConfirmDialog');
    expect(manager).toContain('ContactsTable');
    expect(pageClient).toContain('ContactsManager');
    expect(settingsPage).toContain('SettingsContactsSection');
    expect(table).toContain('ContactDetailSidebar');
    expect(settings).toContain('ContactDetailSidebar');
    expect(settings).toContain('useContactsManager');
    expect(manager).not.toMatch(/\balert\s*\(|\bconfirm\s*\(|\bprompt\s*\(/);
    expect(settings).not.toMatch(/\balert\s*\(|\bconfirm\s*\(|\bprompt\s*\(/);
  });
});
