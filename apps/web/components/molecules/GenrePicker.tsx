'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import { Check, Search } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GENRE_TAXONOMY } from '@/constants/genres';

interface GenreOptionProps {
  readonly genre: string;
  readonly isSelected: boolean;
  readonly onToggle: (genre: string) => void;
}

const GenreOption = memo(function GenreOption({
  genre,
  isSelected,
  onToggle,
}: GenreOptionProps) {
  const handleClick = useCallback(() => {
    onToggle(genre);
  }, [onToggle, genre]);

  return (
    <button
      type='button'
      onClick={handleClick}
      className={`w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 text-app transition-colors ${
        isSelected
          ? 'bg-interactive-hover text-primary-token font-medium'
          : 'text-secondary-token hover:bg-interactive-hover hover:text-primary-token'
      }`}
    >
      {isSelected && (
        <Check className='w-3.5 h-3.5 shrink-0 text-primary-token' />
      )}
      <span className='flex-1 text-left capitalize'>{genre}</span>
    </button>
  );
});

interface GenrePickerProps {
  readonly selected: string[];
  readonly onChange: (genres: string[]) => void;
  readonly maxGenres?: number;
  readonly trigger: React.ReactNode;
}

export function GenrePicker({
  selected,
  onChange,
  maxGenres = 3,
  trigger,
}: GenrePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const normalizedSearch = search.trim().toLowerCase();
  const selectedSet = useMemo(
    () => new Set(selected.map(g => g.toLowerCase())),
    [selected]
  );
  const atCap = selected.length >= maxGenres;

  const filteredGenres = useMemo(() => {
    if (!normalizedSearch) return GENRE_TAXONOMY;
    return GENRE_TAXONOMY.filter(genre => genre.includes(normalizedSearch));
  }, [normalizedSearch]);

  // Sort: selected first, then alphabetical
  const sortedGenres = useMemo(() => {
    return [...filteredGenres].sort((a, b) => {
      const aSelected = selectedSet.has(a);
      const bSelected = selectedSet.has(b);
      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;
      return 0;
    });
  }, [filteredGenres, selectedSet]);

  const handleToggle = useCallback(
    (genre: string) => {
      const normalized = genre.toLowerCase();
      if (selectedSet.has(normalized)) {
        // Remove
        onChange(selected.filter(g => g.toLowerCase() !== normalized));
      } else if (!atCap) {
        // Add
        onChange([...selected, genre]);
      }
    },
    [selected, selectedSet, atCap, onChange]
  );

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setSearch('');
  }, []);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align='start' sideOffset={4} className='w-56 p-0'>
        {/* Search input */}
        <div className='flex items-center gap-2 border-b border-subtle px-3 py-2'>
          <Search className='h-3.5 w-3.5 shrink-0 text-tertiary-token' />
          <input
            ref={searchRef}
            type='text'
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder='Search genres...'
            className='flex-1 bg-transparent text-app text-primary-token placeholder:text-tertiary-token outline-none'
          />
        </div>

        {/* Cap indicator */}
        {atCap && (
          <div className='px-3 py-1.5 border-b border-subtle'>
            <p className='text-2xs text-tertiary-token'>
              Maximum {maxGenres} genres reached
            </p>
          </div>
        )}

        <div className='max-h-64 overflow-y-auto p-1.5'>
          {sortedGenres.length > 0 ? (
            sortedGenres.map(genre => {
              const isSelected = selectedSet.has(genre);
              return (
                <GenreOption
                  key={genre}
                  genre={genre}
                  isSelected={isSelected}
                  onToggle={handleToggle}
                />
              );
            })
          ) : (
            <p className='px-2.5 py-3 text-app text-tertiary-token text-center'>
              No matching genres
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
