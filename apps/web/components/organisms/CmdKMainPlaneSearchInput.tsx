'use client';

import { Search } from 'lucide-react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useLayoutEffect,
  useRef,
} from 'react';

interface CmdKMainPlaneSearchInputProps {
  readonly value: string;
  readonly open: boolean;
  readonly onQueryChange: (query: string) => void;
  readonly onKeyDown: (event: KeyboardEvent) => void;
  readonly listId: string;
  readonly activeRowId: string | null;
  readonly descriptionId: string;
}

export function CmdKMainPlaneSearchInput({
  value,
  open,
  onQueryChange,
  onKeyDown,
  listId,
  activeRowId,
  descriptionId,
}: CmdKMainPlaneSearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  return (
    <div className='flex h-full min-w-0 flex-1 items-center gap-2'>
      <Search
        className='size-4 shrink-0 text-tertiary-token'
        aria-hidden='true'
      />
      <input
        ref={inputRef}
        type='search'
        value={value}
        onChange={event => {
          onQueryChange(event.target.value);
        }}
        onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
          event.stopPropagation();
          onKeyDown(event.nativeEvent);
        }}
        placeholder='Search Jovie or run a command…'
        className='min-w-0 flex-1 appearance-none bg-transparent text-sm text-primary-token outline-none placeholder:text-tertiary-token focus:outline-none focus-visible:outline-none'
        aria-label='Command Palette Search'
        role='combobox'
        aria-autocomplete='list'
        aria-controls={listId}
        aria-activedescendant={activeRowId ?? undefined}
        aria-describedby={descriptionId}
        aria-expanded
        data-testid='command-palette-header-input'
      />
      <span className='hidden shrink-0 text-2xs font-medium text-quaternary-token sm:inline'>
        Esc
      </span>
    </div>
  );
}
