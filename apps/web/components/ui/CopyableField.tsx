'use client';

import { Check, Copy } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface CopyableFieldProps {
  /** The text value to display and copy */
  readonly value: string;
  /** Label used in the toast confirmation (e.g. "Email") */
  readonly label: string;
  /** Optional className for the wrapper */
  readonly className?: string;
  /** Render custom content instead of the raw value */
  readonly children?: React.ReactNode;
  /** Whether to show the toast on copy (default: true) */
  readonly showToast?: boolean;
}

/**
 * CopyableField - Wraps a text value with hover-to-copy functionality.
 *
 * On hover, shows a subtle copy icon. On click, copies the value to clipboard
 * with a toast confirmation. Used in entity sidebars for emails, phone numbers,
 * ISRC codes, URLs, etc.
 */
export function CopyableField({
  value,
  label,
  className,
  children,
  showToast = true,
}: CopyableFieldProps) {
  const [isCopied, setIsCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(value);
        if (showToast) {
          toast.success(`${label} copied to clipboard`);
        }
        setIsCopied(true);
        if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = setTimeout(() => setIsCopied(false), 2000);
      } catch {
        toast.error('Failed to copy');
      }
    },
    [value, label, showToast]
  );

  return (
    <button
      type='button'
      onClick={handleCopy}
      className={cn(
        'group inline-flex items-center gap-1.5 text-left transition-colors',
        isCopied ? 'text-success' : 'hover:text-interactive',
        className
      )}
    >
      <span className='break-all'>{children ?? value}</span>
      {isCopied ? (
        <Check className='h-3 w-3 shrink-0' aria-label='Copied' />
      ) : (
        <Copy
          className='h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100'
          aria-label={`Copy ${label}`}
        />
      )}
    </button>
  );
}

/**
 * Build a "Copy" submenu of copyable fields for context menus.
 * Returns CommonDropdownItem-compatible items for use in entity action menus.
 */
export interface CopyableFieldDef {
  /** Unique ID for the menu item */
  readonly id: string;
  /** Display label (e.g. "Email", "ISRC") */
  readonly label: string;
  /** The value to copy */
  readonly value: string;
}

/**
 * Generates context menu action items for a list of copyable fields.
 * Filters out empty/null values automatically.
 */
export function buildCopyMenuItems(
  fields: ReadonlyArray<CopyableFieldDef | null | undefined>
): Array<{
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}> {
  return fields
    .filter((f): f is CopyableFieldDef => f?.value != null && f.value !== '')
    .map(field => ({
      id: `copy-${field.id}`,
      label: `Copy ${field.label}`,
      icon: <Copy className='h-3.5 w-3.5' />,
      onClick: () => {
        void navigator.clipboard.writeText(field.value);
        toast.success(`${field.label} copied to clipboard`);
      },
    }));
}
