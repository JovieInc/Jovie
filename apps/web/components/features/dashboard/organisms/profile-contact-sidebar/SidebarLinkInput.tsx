'use client';

/* eslint-disable react-hooks/refs -- refs.setReference and refs.setFloating from useFloating are callback refs, not ref value accesses */

import {
  autoUpdate,
  FloatingPortal,
  flip,
  offset,
  shift,
  size,
  useFloating,
} from '@floating-ui/react';
import { Input } from '@jovie/ui';
import { useCallback } from 'react';

import {
  getPlatformIconMetadata,
  SocialIcon,
} from '@/components/atoms/SocialIcon';
import { LINEAR_SURFACE } from '@/components/features/dashboard/tokens';
import type { LinkSection } from '@/features/dashboard/organisms/links/utils/link-display-utils';
import { cn } from '@/lib/utils';
import { getContrastTextOnBrand } from '@/lib/utils/color';
import type { DetectedLink } from '@/lib/utils/platform-detection';

import { useUniversalLinkInput } from '../../molecules/universal-link-input/useUniversalLinkInput';
import {
  looksLikeUrlOrDomain,
  type RankedPlatformOption,
} from '../../molecules/universal-link-input/utils';

interface SidebarLinkInputProps {
  readonly categoryFilter: LinkSection;
  readonly existingPlatforms: string[];
  readonly onAdd: (link: DetectedLink) => void;
  readonly onCancel: () => void;
  readonly creatorName?: string;
}

function SidebarSuggestionItem({
  option,
  active,
  onMouseEnter,
  onClick,
}: {
  readonly option: RankedPlatformOption;
  readonly active: boolean;
  readonly onMouseEnter: () => void;
  readonly onClick: () => void;
}) {
  const iconMeta = getPlatformIconMetadata(option.icon);
  const iconHex = iconMeta?.hex ? `#${iconMeta.hex}` : '#6b7280';

  return (
    <button
      type='button'
      className={cn(
        'flex w-full min-h-[44px] items-center gap-2.5 px-3 py-2.5 text-left text-app text-primary-token transition',
        active ? 'bg-surface-2' : 'hover:bg-surface-2',
        'active:scale-[0.99]'
      )}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      <span
        className='flex h-6 w-6 shrink-0 items-center justify-center rounded-md'
        style={{
          backgroundColor: iconHex,
          color: getContrastTextOnBrand(iconHex),
        }}
      >
        <SocialIcon platform={option.icon} className='h-3.5 w-3.5' />
      </span>
      <span className='font-caption'>{option.name}</span>
      <span className='text-xs text-tertiary-token'>{option.hint}</span>
      {active && (
        <span className='ml-auto max-sm:hidden text-xs text-tertiary-token sm:inline'>
          Enter
        </span>
      )}
    </button>
  );
}

export function SidebarLinkInput({
  categoryFilter,
  existingPlatforms,
  onAdd,
  onCancel,
  creatorName,
}: SidebarLinkInputProps) {
  const {
    url,
    activeSuggestionIndex,
    urlInputRef,
    detectedLink,
    platformSuggestions,
    shouldShowAutosuggest,
    handleUrlChange,
    handleKeyDown: hookKeyDown,
    handleAdd,
    setAutosuggestOpen,
    setActiveSuggestionIndex,
    commitPlatformSelection,
  } = useUniversalLinkInput({
    onAdd,
    existingPlatforms,
    creatorName,
    categoryFilter,
    chatEnabled: false,
    clearSignal: 0,
  });

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape' && !shouldShowAutosuggest) {
        e.preventDefault();
        onCancel();
        return;
      }
      hookKeyDown(e);
    },
    [hookKeyDown, onCancel, shouldShowAutosuggest]
  );

  const { refs, floatingStyles } = useFloating({
    open: shouldShowAutosuggest,
    placement: 'bottom-start',
    middleware: [
      offset(4),
      flip(),
      shift({ padding: 8 }),
      size({
        apply({ rects, elements }) {
          Object.assign(elements.floating.style, {
            minWidth: `${rects.reference.width}px`,
          });
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  });

  return (
    <div
      ref={refs.setReference}
      className={cn('relative', LINEAR_SURFACE.drawerCard, 'p-2')}
    >
      <Input
        ref={urlInputRef}
        type='url'
        placeholder='Type name or paste link...'
        value={url}
        onChange={e => handleUrlChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          const trimmed = url.trim();
          if (
            trimmed.length > 0 &&
            !looksLikeUrlOrDomain(trimmed) &&
            !detectedLink?.isValid
          ) {
            setAutosuggestOpen(true);
          }
        }}
        onBlur={() => {
          setTimeout(() => {
            setAutosuggestOpen(false);
            setActiveSuggestionIndex(0);
          }, 150);
          setTimeout(() => {
            if (!urlInputRef.current?.value.trim()) {
              onCancel();
            }
          }, 200);
        }}
        inputMode='url'
        autoCapitalize='none'
        autoCorrect='off'
        autoComplete='off'
        className='h-9 rounded-lg border-(--linear-app-frame-seam) bg-surface-0 text-app'
        aria-label='Add link'
        autoFocus
      />

      {shouldShowAutosuggest && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className='z-100 max-h-60 overflow-y-auto overflow-x-hidden overscroll-contain rounded-[10px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) py-1 shadow-popover'
            onMouseDown={e => e.preventDefault()}
            aria-hidden='true'
          >
            {platformSuggestions.map((option, index) => (
              <SidebarSuggestionItem
                key={option.id}
                option={option}
                active={index === activeSuggestionIndex}
                onMouseEnter={() => setActiveSuggestionIndex(index)}
                onClick={() => commitPlatformSelection(option)}
              />
            ))}
          </div>
        </FloatingPortal>
      )}

      {detectedLink?.isValid && (
        <button
          type='button'
          onClick={handleAdd}
          className='mt-2 flex w-full items-center gap-2 rounded-md border border-(--linear-app-frame-seam) bg-surface-0 px-3 py-2 text-app transition-colors hover:bg-surface-1'
        >
          <SocialIcon
            platform={detectedLink.platform.icon}
            className='h-4 w-4'
          />
          <span className='min-w-0 flex-1 truncate'>
            {detectedLink.normalizedUrl}
          </span>
          <span className='ml-auto shrink-0 text-app font-caption text-accent'>
            Add
          </span>
        </button>
      )}
    </div>
  );
}
