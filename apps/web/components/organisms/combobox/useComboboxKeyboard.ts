'use client';

import { type KeyboardEvent, useCallback } from 'react';
import type { ComboboxOption } from './types';

interface UseComboboxKeyboardProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  activeIndex: number;
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>;
  filteredOptions: ComboboxOption[];
  handleSelect: (option: ComboboxOption | null) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export function useComboboxKeyboard({
  isOpen,
  setIsOpen,
  activeIndex,
  setActiveIndex,
  filteredOptions,
  handleSelect,
  inputRef,
}: UseComboboxKeyboardProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          setIsOpen(true);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex(prev =>
            prev < filteredOptions.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex(prev =>
            prev > 0 ? prev - 1 : filteredOptions.length - 1
          );
          break;
        case 'Home':
          e.preventDefault();
          setActiveIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setActiveIndex(filteredOptions.length - 1);
          break;
        case 'Enter':
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < filteredOptions.length) {
            handleSelect(filteredOptions[activeIndex]);
            setIsOpen(false);
            inputRef.current?.focus();
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          inputRef.current?.focus();
          break;
        case 'Tab':
          setIsOpen(false);
          break;
      }
    },
    [
      filteredOptions,
      isOpen,
      activeIndex,
      handleSelect,
      setIsOpen,
      setActiveIndex,
      inputRef,
    ]
  );

  return { handleKeyDown };
}
