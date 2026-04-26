'use client';

import { Input } from '@jovie/ui';
import { Check, Copy, ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { DrawerInlineIconButton } from '@/components/molecules/drawer/DrawerInlineIconButton';
import { useClipboard } from '@/hooks/useClipboard';
import { cn } from '@/lib/utils';

export interface DrawerEditableTextFieldAction {
  readonly id: string;
  readonly ariaLabel: string;
  readonly icon?: ReactNode;
  readonly href?: string;
  readonly onClick?: () => void;
  readonly showWhenEmpty?: boolean;
}

export interface DrawerEditableTextFieldProps {
  readonly label: string;
  readonly value: string | null | undefined;
  readonly editable?: boolean;
  readonly placeholder?: string;
  readonly emptyLabel?: string;
  readonly inputType?: string;
  readonly monospace?: boolean;
  readonly normalizeValue?: (value: string) => string | null;
  readonly onSave?: (value: string | null) => Promise<void> | void;
  readonly copyValue?: string | null;
  readonly copyLabel?: string;
  readonly actions?: readonly DrawerEditableTextFieldAction[];
  readonly className?: string;
  readonly displayClassName?: string;
  readonly emptyClassName?: string;
  readonly inputClassName?: string;
  /**
   * Controls the density of the display-mode trigger so it can align with
   * sibling static text rows.
   *
   * - `comfortable` (default) renders a padded chip-style trigger suitable
   *   for standalone use.
   * - `inline` removes the display-mode horizontal inset and shrinks the
   *   trigger to the text baseline, keeping hover affordance via a
   *   background chip. Use this inside property grids where editable rows
   *   sit alongside static text rows.
   */
  readonly density?: 'comfortable' | 'inline';
}

export function DrawerEditableTextField({
  label,
  value,
  editable = false,
  placeholder,
  emptyLabel = '—',
  inputType = 'text',
  monospace = false,
  normalizeValue,
  onSave,
  copyValue,
  copyLabel,
  actions = [],
  className,
  displayClassName,
  emptyClassName,
  inputClassName,
  density = 'comfortable',
}: Readonly<DrawerEditableTextFieldProps>) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { copy, isSuccess } = useClipboard();

  const normalize = useMemo(
    () =>
      normalizeValue ??
      ((nextValue: string) => {
        const trimmed = nextValue.trim();
        return trimmed || null;
      }),
    [normalizeValue]
  );

  useEffect(() => {
    setIsEditing(false);
    setDraft(value ?? '');
  }, [value]);

  useEffect(() => {
    if (!isEditing || !inputRef.current) {
      return;
    }

    inputRef.current.focus();
    inputRef.current.select();
  }, [isEditing]);

  const commit = useCallback(async () => {
    if (!editable || !onSave) {
      setIsEditing(false);
      return;
    }

    const nextValue = normalize(draft);
    const currentValue = normalize(value ?? '');
    setIsEditing(false);

    if (nextValue === currentValue) {
      return;
    }

    try {
      await onSave(nextValue);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : `Couldn't update ${label}`
      );
    }
  }, [draft, editable, label, normalize, onSave, value]);

  const cancel = useCallback(() => {
    setDraft(value ?? '');
    setIsEditing(false);
  }, [value]);

  const handleCopy = useCallback(async () => {
    const nextValue = copyValue ?? value ?? '';
    if (!nextValue) {
      return;
    }
    await copy(nextValue);
  }, [copy, copyValue, value]);

  const handleCommit = useCallback(() => {
    commit().catch(() => {
      // commit() already reports save failures through toast.
    });
  }, [commit]);

  const handleCopyClick = useCallback(() => {
    handleCopy().catch(() => {
      // Copy failures are non-critical and already surfaced by useClipboard.
    });
  }, [handleCopy]);

  const hasValue = Boolean(value);
  const visibleActions = actions.filter(
    action => hasValue || action.showWhenEmpty === true
  );
  const actionSlotIds = [
    ...((copyValue ?? value) ? ['copy'] : []),
    ...visibleActions.map(action => action.id),
  ];
  const displayValue = value || emptyLabel;

  return (
    <div className={cn('flex min-w-0 items-center gap-1.5', className)}>
      <div className='min-w-0 flex-1'>
        {isEditing && editable ? (
          <Input
            ref={inputRef}
            type={inputType}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onBlur={handleCommit}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleCommit();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                cancel();
              }
            }}
            placeholder={placeholder ?? emptyLabel}
            aria-label={`Edit ${label}`}
            className={cn(
              'h-8 w-full rounded-lg border-(--linear-app-frame-seam) bg-surface-0 px-2.5 text-app text-primary-token',
              monospace && 'font-mono tracking-[0.02em]',
              inputClassName
            )}
          />
        ) : null}
        {editable && !isEditing ? (
          <button
            type='button'
            onClick={() => setIsEditing(true)}
            onDoubleClick={() => setIsEditing(true)}
            className={cn(
              'flex w-full min-w-0 cursor-text items-center text-left transition-colors',
              density === 'inline'
                ? // Align the text baseline with sibling static rows by
                  // removing horizontal inset. The hover chip sits over the
                  // text area so editable and static rows share the same
                  // visual grid.
                  'h-auto px-0 py-0 rounded-[6px] hover:bg-surface-0'
                : 'h-8 rounded-lg px-2.5 hover:bg-surface-0',
              density === 'inline' ? undefined : inputClassName,
              'border border-transparent bg-transparent shadow-none',
              !hasValue && 'text-tertiary-token'
            )}
            aria-label={`Edit ${label}`}
          >
            <span
              className={cn(
                'block truncate text-app text-primary-token',
                monospace && 'font-mono tracking-[0.02em]',
                !hasValue && 'italic text-tertiary-token',
                displayClassName,
                !hasValue && emptyClassName
              )}
              title={hasValue ? (value ?? undefined) : undefined}
            >
              {displayValue}
            </span>
          </button>
        ) : null}
        {editable ? null : (
          <span
            className={cn(
              'block min-w-0 w-full truncate text-app text-primary-token',
              monospace && 'font-mono tracking-[0.02em]',
              !hasValue && 'italic text-tertiary-token',
              displayClassName,
              !hasValue && emptyClassName
            )}
            title={hasValue ? (value ?? undefined) : undefined}
          >
            {displayValue}
          </span>
        )}
      </div>

      {actionSlotIds.length > 0 ? (
        <div
          data-slot='drawer-editable-text-field-actions'
          className='flex shrink-0 items-center gap-0.5'
          aria-hidden={isEditing ? 'true' : undefined}
        >
          {isEditing
            ? actionSlotIds.map(slotId => (
                <span
                  key={`action-slot-placeholder-${slotId}`}
                  className='h-6 w-6 shrink-0 rounded-[6px] opacity-0'
                />
              ))
            : null}

          {!isEditing && (copyValue ?? value) ? (
            <DrawerInlineIconButton
              onClick={event => {
                event.stopPropagation();
                handleCopyClick();
              }}
              aria-label={copyLabel ?? `Copy ${label}`}
              className='h-6 w-6 text-tertiary-token'
            >
              {isSuccess ? (
                <Check className='h-3.5 w-3.5 text-success' />
              ) : (
                <Copy className='h-3.5 w-3.5' />
              )}
            </DrawerInlineIconButton>
          ) : null}

          {isEditing
            ? null
            : visibleActions.map(action =>
                action.href ? (
                  <a
                    key={action.id}
                    href={action.href}
                    target='_blank'
                    rel='noreferrer'
                    aria-label={action.ariaLabel}
                    className='inline-flex h-6 w-6 items-center justify-center rounded-[6px] text-tertiary-token transition-colors hover:bg-surface-0 hover:text-primary-token'
                    onClick={event => {
                      event.stopPropagation();
                      action.onClick?.();
                    }}
                  >
                    {action.icon ?? <ExternalLink className='h-3.5 w-3.5' />}
                  </a>
                ) : (
                  <DrawerInlineIconButton
                    key={action.id}
                    onClick={event => {
                      event.stopPropagation();
                      action.onClick?.();
                    }}
                    aria-label={action.ariaLabel}
                    className='h-6 w-6 text-tertiary-token'
                  >
                    {action.icon ?? <ExternalLink className='h-3.5 w-3.5' />}
                  </DrawerInlineIconButton>
                )
              )}
        </div>
      ) : null}
    </div>
  );
}
