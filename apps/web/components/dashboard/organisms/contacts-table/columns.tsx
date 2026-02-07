'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { createColumnHelper } from '@tanstack/react-table';
import { Copy, Mail, Phone, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  TableActionMenu,
  type TableActionMenuItem,
} from '@/components/atoms/table-action-menu';
import type { EditableContact } from '@/components/dashboard/hooks/useContactsManager';
import {
  getContactRoleLabel,
  summarizeTerritories,
} from '@/lib/contacts/constants';

const contactColumnHelper = createColumnHelper<EditableContact>();

function buildNameCompany(contact: EditableContact): string {
  const parts = [contact.personName, contact.companyName].filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} @ ${parts[1]}`;
}

function copyToClipboard(text: string, label: string) {
  void navigator.clipboard.writeText(text);
  toast.success(`${label} copied`);
}

/**
 * Click handler for copy buttons using data attributes.
 * Avoids creating new function instances on every render.
 */
function handleCopyClick(e: React.MouseEvent<HTMLButtonElement>) {
  e.stopPropagation();
  const text = e.currentTarget.dataset.copyText;
  const label = e.currentTarget.dataset.copyLabel;
  if (text && label) {
    copyToClipboard(text, label);
  }
}

export interface ContactColumnCallbacks {
  readonly onDelete: (contact: EditableContact) => void;
}

// biome-ignore lint/suspicious/noExplicitAny: TanStack Table column defs require any for mixed accessor types
type ContactColumnDef = ColumnDef<EditableContact, any>;

export function createContactColumns(
  callbacks: ContactColumnCallbacks
): ContactColumnDef[] {
  return [
    // Role column
    contactColumnHelper.accessor('role', {
      id: 'role',
      header: 'Role',
      cell: ({ row }) => {
        const contact = row.original;
        const label = getContactRoleLabel(contact.role, contact.customLabel);
        return <span className='font-medium text-primary-token'>{label}</span>;
      },
      size: 180,
    }),

    // Name/Company column
    contactColumnHelper.display({
      id: 'nameCompany',
      header: 'Name / Company',
      cell: ({ row }) => {
        const text = buildNameCompany(row.original);
        return <span className='text-secondary-token truncate'>{text}</span>;
      },
      size: 200,
    }),

    // Territories column
    contactColumnHelper.accessor('territories', {
      id: 'territories',
      header: 'Territories',
      cell: ({ row }) => {
        const { summary } = summarizeTerritories(row.original.territories);
        return <span className='text-secondary-token'>{summary}</span>;
      },
      size: 140,
    }),

    // Email column
    contactColumnHelper.accessor('email', {
      id: 'email',
      header: 'Email',
      cell: ({ row }) => {
        const email = row.original.email;
        if (!email) return <span className='text-tertiary-token'>—</span>;
        return (
          <button
            type='button'
            onClick={handleCopyClick}
            data-copy-text={email}
            data-copy-label='Email'
            className='group flex items-center gap-1.5 text-secondary-token hover:text-primary-token transition-colors'
          >
            <Mail className='h-3.5 w-3.5 text-tertiary-token group-hover:text-primary-token' />
            <span className='truncate max-w-[160px]'>{email}</span>
          </button>
        );
      },
      size: 200,
    }),

    // Phone column
    contactColumnHelper.accessor('phone', {
      id: 'phone',
      header: 'Phone',
      cell: ({ row }) => {
        const phone = row.original.phone;
        if (!phone) return <span className='text-tertiary-token'>—</span>;
        return (
          <button
            type='button'
            onClick={handleCopyClick}
            data-copy-text={phone}
            data-copy-label='Phone'
            className='group flex items-center gap-1.5 text-secondary-token hover:text-primary-token transition-colors'
          >
            <Phone className='h-3.5 w-3.5 text-tertiary-token group-hover:text-primary-token' />
            <span className='truncate max-w-[120px]'>{phone}</span>
          </button>
        );
      },
      size: 160,
    }),

    // Actions column with dropdown menu
    contactColumnHelper.display({
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const contact = row.original;
        const items: TableActionMenuItem[] = [];

        if (contact.email) {
          items.push({
            id: 'copy-email',
            label: 'Copy email',
            icon: Copy,
            onClick: () => copyToClipboard(contact.email!, 'Email'),
          });
        }

        if (contact.phone) {
          items.push({
            id: 'copy-phone',
            label: 'Copy phone',
            icon: Copy,
            onClick: () => copyToClipboard(contact.phone!, 'Phone'),
          });
        }

        if (items.length > 0) {
          items.push({ id: 'separator', label: '', onClick: () => {} });
        }

        items.push({
          id: 'delete',
          label: 'Delete contact',
          icon: Trash2,
          variant: 'destructive',
          onClick: () => callbacks.onDelete(contact),
        });

        return (
          <div className='flex items-center justify-end'>
            <TableActionMenu items={items} align='end' />
          </div>
        );
      },
      size: 48,
    }),
  ];
}
