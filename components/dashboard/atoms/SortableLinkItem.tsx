'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Input, Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import React, { forwardRef, KeyboardEvent, useCallback, useState } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import type { LinkItem } from '@/types/links';

interface SortableLinkItemProps {
  link: LinkItem;
  onUpdate: (id: string, updates: Partial<LinkItem>) => void;
  onDelete: (id: string) => void;
  disabled?: boolean;
  isFocused?: boolean;
  index?: number;
  totalItems?: number;
}

export const SortableLinkItem = forwardRef<
  HTMLDivElement,
  SortableLinkItemProps
>(
  (
    {
      link,
      onUpdate,
      onDelete,
      disabled = false,
      isFocused = false,
      index = 0,
      totalItems = 0,
    },
    ref
  ) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState(link.title);
    const [isHovered, setIsHovered] = useState(false);

    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: link.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    const brandColor = `#${link.platform.color}`;
    const hexToRgb = (hex: string) => {
      const h = hex.replace('#', '');
      const bigint = parseInt(h, 16);
      return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255,
      };
    };
    const relativeLuminance = (hex: string) => {
      const { r, g, b } = hexToRgb(hex);
      const [R, G, B] = [r, g, b].map(v => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * R + 0.7152 * G + 0.0722 * B;
    };
    const isDarkBrand = relativeLuminance(brandColor) < 0.35;
    const iconColor = isDarkBrand ? '#ffffff' : brandColor;
    const iconBg = isDarkBrand ? 'rgba(255,255,255,0.08)' : `${brandColor}15`;

    // Handle title editing
    const handleTitleClick = useCallback(() => {
      if (!disabled) {
        setIsEditing(true);
      }
    }, [disabled]);

    const handleTitleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setEditTitle(e.target.value);
      },
      []
    );

    const handleTitleSubmit = useCallback(() => {
      onUpdate(link.id, { title: editTitle.trim() || link.suggestedTitle });
      setIsEditing(false);
    }, [link.id, link.suggestedTitle, editTitle, onUpdate]);

    const handleTitleKeyPress = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
          handleTitleSubmit();
        } else if (e.key === 'Escape') {
          setEditTitle(link.title);
          setIsEditing(false);
        }
      },
      [handleTitleSubmit, link.title]
    );

    // Handle visibility toggle
    const handleVisibilityToggle = useCallback(() => {
      onUpdate(link.id, { isVisible: !link.isVisible });
    }, [link.id, link.isVisible, onUpdate]);

    // Handle delete with undo capability
    const handleDelete = useCallback(() => {
      onDelete(link.id);
    }, [link.id, onDelete]);

    // Handle keyboard shortcuts for item actions
    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLDivElement>) => {
        if (disabled) return;

        switch (e.key) {
          case 'Delete':
          case 'Backspace':
            if (e.metaKey || e.ctrlKey) {
              e.preventDefault();
              handleDelete();
            }
            break;
          case 'Enter':
            if (!isEditing) {
              e.preventDefault();
              handleTitleClick();
            }
            break;
          case 'v':
            if (e.altKey) {
              e.preventDefault();
              handleVisibilityToggle();
            }
            break;
          case 'ArrowUp':
          case 'ArrowDown':
            // Let parent handle these for navigation
            break;
        }
      },
      [
        disabled,
        isEditing,
        handleDelete,
        handleTitleClick,
        handleVisibilityToggle,
      ]
    );

    return (
      <div
        ref={node => {
          // Set both refs - the sortable ref and the forwarded ref
          setNodeRef(node);
          if (typeof ref === 'function') {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        style={style}
        className={`
        group relative bg-surface-1 rounded-lg border border-subtle 
        transition-all duration-200 hover:border-default
        ${isDragging ? 'shadow-lg z-50 rotate-1' : 'hover:shadow-sm'}
        ${!link.isVisible ? 'opacity-60' : ''}
        ${isFocused ? 'ring-2 ring-indigo-500' : ''}
      `}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role='listitem'
        aria-label={`${link.title} link from ${link.platform.name}`}
        aria-roledescription='sortable item'
        aria-describedby={`link-${link.id}-description`}
        data-position={index + 1}
        data-total={totalItems}
      >
        <span id={`link-${link.id}-description`} className='sr-only'>
          {link.isVisible ? 'Visible' : 'Hidden'} link to {link.normalizedUrl}.
          Press Enter to edit, Alt+V to toggle visibility, or Control+Delete to
          remove.
          {isDragging ? ' Currently dragging.' : ''}
        </span>
        <div className='flex items-center gap-2 p-2'>
          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            disabled={disabled}
            className={`
            cursor-grab active:cursor-grabbing flex items-center justify-center
            w-5 h-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300
            transition-opacity duration-200
            ${isHovered ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
          `}
            aria-label='Drag to reorder'
            aria-describedby={`drag-instructions-${link.id}`}
          >
            <span id={`drag-instructions-${link.id}`} className='sr-only'>
              Use space bar to start dragging, arrow keys to move, and space bar
              again to drop
            </span>
            <svg
              width='12'
              height='12'
              viewBox='0 0 12 12'
              fill='currentColor'
              aria-hidden='true'
            >
              <circle cx='3' cy='3' r='1' />
              <circle cx='9' cy='3' r='1' />
              <circle cx='3' cy='9' r='1' />
              <circle cx='9' cy='9' r='1' />
            </svg>
          </button>

          {/* Platform icon */}
          <div
            className='flex items-center justify-center w-8 h-8 rounded-lg shrink-0'
            style={{
              backgroundColor: iconBg,
              color: iconColor,
            }}
            aria-hidden='true'
          >
            <SocialIcon platform={link.platform.icon} className='w-4 h-4' />
          </div>

          {/* Link content */}
          <div className='flex-1 min-w-0'>
            {/* Title (editable) */}
            {isEditing ? (
              <Input
                type='text'
                value={editTitle}
                onChange={handleTitleChange}
                onBlur={handleTitleSubmit}
                onKeyDown={handleTitleKeyPress}
                inputMode='text'
                autoCapitalize='words'
                autoCorrect='on'
                autoComplete='off'
                className='text-sm font-medium -my-1'
                autoFocus
                aria-label='Edit link title'
              />
            ) : (
              <button
                onClick={handleTitleClick}
                disabled={disabled}
                className='text-left text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-gray-700 dark:hover:text-gray-300 transition-colors truncate w-full'
                aria-label={`Edit ${link.title}`}
              >
                {link.title}
              </button>
            )}

            {/* Platform and URL */}
            <div className='flex items-center gap-2 mt-1' aria-hidden='true'>
              <span className='text-xs text-gray-500 dark:text-gray-400'>
                {link.platform.name}
              </span>
              <span className='text-xs text-gray-400 dark:text-gray-500'>
                •
              </span>
              <span className='text-xs text-gray-400 dark:text-gray-500 truncate'>
                {link.normalizedUrl.replace(/^https?:\/\//, '')}
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className='shrink-0 flex items-center gap-1.5'>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleVisibilityToggle}
                  disabled={disabled}
                  className='inline-flex items-center justify-center w-7 h-7 rounded-md border border-subtle bg-surface-0 text-tertiary-token hover:bg-surface-2 hover:text-secondary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0'
                  aria-label={
                    link.isVisible
                      ? `Hide ${link.title} link`
                      : `Show ${link.title} link`
                  }
                  aria-pressed={link.isVisible}
                >
                  {link.isVisible ? (
                    <svg
                      className='w-4 h-4'
                      viewBox='0 0 24 24'
                      fill='none'
                      stroke='currentColor'
                      aria-hidden='true'
                    >
                      <path d='M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z' />
                      <circle cx='12' cy='12' r='3' />
                    </svg>
                  ) : (
                    <svg
                      className='w-4 h-4'
                      viewBox='0 0 24 24'
                      fill='none'
                      stroke='currentColor'
                      aria-hidden='true'
                    >
                      <path d='M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 2.16-3.19m6.72 1.07a3 3 0 1 1 4.24 4.24' />
                      <line x1='1' y1='1' x2='23' y2='23' />
                    </svg>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side='top'>
                {link.isVisible ? 'Hide link' : 'Show link'}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleDelete}
                  disabled={disabled}
                  className='inline-flex items-center justify-center w-7 h-7 rounded-md border border-subtle bg-surface-0 text-tertiary-token hover:bg-surface-2 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0'
                  aria-label={`Delete ${link.title} link`}
                >
                  <svg
                    className='w-4 h-4'
                    viewBox='0 0 24 24'
                    fill='none'
                    stroke='currentColor'
                    aria-hidden='true'
                  >
                    <path d='M3 6h18' />
                    <path d='M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' />
                    <path d='M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' />
                  </svg>
                </button>
              </TooltipTrigger>
              <TooltipContent side='top'>Remove link</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Hover indicator */}
        <div
          className='absolute inset-0 rounded-lg pointer-events-none transition-all duration-200'
          style={{
            boxShadow:
              isHovered && !isDragging ? `0 0 0 1px ${brandColor}30` : 'none',
          }}
          aria-hidden='true'
        />
      </div>
    );
  }
);

SortableLinkItem.displayName = 'SortableLinkItem';
