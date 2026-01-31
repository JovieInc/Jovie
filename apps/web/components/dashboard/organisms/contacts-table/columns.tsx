'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { createColumnHelper } from '@tanstack/react-table';
import { Mail, MoreHorizontal, Phone } from 'lucide-react';
import { toast } from 'sonner';
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

// biome-ignore lint/suspicious/noExplicitAny: TanStack Table column defs require any for mixed accessor types
export function createContactColumns(): ColumnDef<EditableContact, any>[] {
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

    // Actions column (placeholder for menu)
    contactColumnHelper.display({
      id: 'actions',
      header: '',
      cell: () => (
        <div className='flex justify-end'>
          <MoreHorizontal className='h-4 w-4 text-tertiary-token' />
        </div>
      ),
      size: 48,
    }),
  ];
}
