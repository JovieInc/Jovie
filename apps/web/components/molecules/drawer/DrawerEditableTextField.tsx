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
        return trimmed ? trimmed : null;
      }),
    [normalizeValue]
  );

  useEffect(() => {
    if (!isEditing) {
      setDraft(value ?? '');
    }
  }, [isEditing, value]);

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

  const hasValue = Boolean(value);
  const visibleActions = actions.filter(
    action => hasValue || action.showWhenEmpty === true
  );

  if (isEditing && editable) {
    return (
      <Input
        ref={inputRef}
        type={inputType}
        value={draft}
        onChange={event => setDraft(event.target.value)}
        onBlur={() => {
          void commit();
        }}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void commit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            cancel();
          }
        }}
        placeholder={placeholder ?? emptyLabel}
        aria-label={`Edit ${label}`}
        className={cn(
          'h-8 rounded-[8px] border-(--linear-app-frame-seam) bg-surface-0 px-2.5 text-[13px] text-primary-token',
          monospace && 'font-mono tracking-[0.02em]',
          inputClassName
        )}
      />
    );
  }

  const displayValue = value || emptyLabel;

  return (
    <div className={cn('flex min-w-0 items-center gap-1.5', className)}>
      {editable ? (
        <button
          type='button'
          onClick={() => setIsEditing(true)}
          onDoubleClick={() => setIsEditing(true)}
          className={cn(
            '-mx-1 min-w-0 flex-1 cursor-text rounded-[8px] px-1 py-0.5 text-left transition-colors hover:bg-surface-0',
            !hasValue && 'text-tertiary-token'
          )}
          aria-label={`Edit ${label}`}
        >
          <span
            className={cn(
              'block truncate text-[13px] text-primary-token',
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
      ) : (
        <span
          className={cn(
            'block min-w-0 flex-1 truncate text-[13px] text-primary-token',
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

      <div className='flex shrink-0 items-center gap-0.5'>
        {(copyValue ?? value) ? (
          <DrawerInlineIconButton
            onClick={event => {
              event.stopPropagation();
              void handleCopy();
            }}
            aria-label={copyLabel ?? `Copy ${label}`}
            className='text-tertiary-token'
          >
            {isSuccess ? (
              <Check className='h-3.5 w-3.5 text-success' />
            ) : (
              <Copy className='h-3.5 w-3.5' />
            )}
          </DrawerInlineIconButton>
        ) : null}

        {visibleActions.map(action =>
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
              className='text-tertiary-token'
            >
              {action.icon ?? <ExternalLink className='h-3.5 w-3.5' />}
            </DrawerInlineIconButton>
          )
        )}
      </div>
    </div>
  );
}
