'use client';

import { ConfirmDialog } from '@jovie/ui';
import { getContactRoleLabel } from '@/lib/contacts/constants';
import type { EditableContact } from '@/types/contacts';

export interface ContactDeleteConfirmDialogProps {
  readonly contact: Pick<EditableContact, 'role' | 'customLabel'> | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ContactDeleteConfirmDialog({
  contact,
  onConfirm,
  onCancel,
}: ContactDeleteConfirmDialogProps) {
  const deleteLabel = contact
    ? getContactRoleLabel(contact.role, contact.customLabel)
    : '';

  return (
    <ConfirmDialog
      open={Boolean(contact)}
      onOpenChange={open => {
        if (!open) onCancel();
      }}
      title='Delete Contact'
      description={`Remove the "${deleteLabel}" contact from your profile? This action cannot be undone.`}
      confirmLabel='Delete'
      variant='destructive'
      onConfirm={onConfirm}
    />
  );
}
