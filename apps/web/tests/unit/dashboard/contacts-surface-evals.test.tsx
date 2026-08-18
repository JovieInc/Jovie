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

  it('keeps Contacts on one primary workspace surface', () => {
    const page = readWeb('app/app/(shell)/contacts/page.tsx');

    expect(page).toContain(
      "className='flex h-full min-h-0 flex-col bg-(--app-shell-content-surface)'"
    );
  });

  it('keeps Contact and Audience details on one shared flat rail surface and reserves elevation for overlays', () => {
    const rail = readWeb('components/molecules/drawer/EntityTabbedRail.tsx');
    const details = readWeb(
      'components/features/dashboard/organisms/contacts-table/ContactDetailSidebar.tsx'
    );
    const audience = readWeb(
      'components/features/dashboard/organisms/audience-member-sidebar/AudienceMemberSidebar.tsx'
    );
    const audienceHeader = readWeb(
      'components/features/dashboard/atoms/AudienceMemberHeader.tsx'
    );

    expect(rail).toContain(
      "drawerClassName='rounded-none border-y-0 border-r-0 bg-surface-2 shadow-none'"
    );
    expect(rail).toContain("workspaceSurface='flat'");
    expect(rail).toContain("surfaceVariant='flat'");
    expect(details).toContain('<EntityTabbedRail');
    expect(audience).toContain('<EntityTabbedRail');
    expect(details).toContain("layout='grid'");
    expect(details).toContain("testId='contact-entity-avatar-frame'");
    expect(audienceHeader).toContain("layout='grid'");
    expect(audienceHeader).toContain('<DrawerEntityAvatar');
    expect(details).toContain('<SelectContent');
    expect(details).not.toContain('<SelectContent className');
    expect(details).toContain('<DrawerChoiceChipGroup');
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
    expect(settings).toContain('ContactListRow');
    expect(settings).toContain('ContactDeleteConfirmDialog');
    expect(manager).not.toMatch(/\balert\s*\(|\bconfirm\s*\(|\bprompt\s*\(/);
    expect(settings).not.toMatch(/\balert\s*\(|\bconfirm\s*\(|\bprompt\s*\(/);
  });
});
