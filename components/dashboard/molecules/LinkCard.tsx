'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GripVertical, Eye, Trash2, Link2, ChevronDown, Pencil, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/atoms/Tooltip';
import { EditLinkModal } from './EditLinkModal';

type Platform = 'instagram' | 'twitter' | 'tiktok' | 'youtube' | 'spotify' | 'applemusic' | 'custom';

interface LinkCardProps {
  id: string;
  title: string;
  url: string;
  platform: Platform;
  isVisible: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onDragStart: (e: React.PointerEvent, id: string) => void;
  isDragging?: boolean;
}

const platformIcons = {
  instagram: 'i-simple-icons-instagram',
  twitter: 'i-simple-icons-twitter',
  tiktok: 'i-simple-icons-tiktok',
  youtube: 'i-simple-icons-youtube',
  spotify: 'i-simple-icons-spotify',
  applemusic: 'i-simple-icons-applemusic',
  custom: 'i-heroicons-link',
};

export function LinkCard({
  id,
  title,
  url,
  platform,
  isVisible,
  onEdit,
  onDelete,
  onToggleVisibility,
  onDragStart,
  isDragging = false,
}: LinkCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Handle platform display name
  const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
  
  // Handle URL display (truncate if too long)
  const displayUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  
  // Handle drag start
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || isSaving) return; // Only left mouse button and not when saving
    onDragStart(e, id);
  };

  // Handle edit click
  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(id);
  };

  // Toggle expanded state
  const toggleExpanded = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  return (
    <motion.div
      ref={cardRef}
      layout
      initial={false}
      animate={{
        opacity: isDragging ? 0.8 : isSaving ? 0.9 : 1,
        scale: isDragging ? 1.02 : 1,
        transition: { duration: 0.15 },
      }}
      className={cn(
        'relative group rounded-xl transition-all duration-200',
        'bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900/50 dark:to-gray-800/50',
        'border border-gray-100/80 dark:border-gray-700/50',
        'shadow-sm hover:shadow-md',
        'overflow-hidden',
        isDragging && 'shadow-lg z-10',
        !isVisible && 'opacity-60',
        isSaving && 'pointer-events-none',
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="p-4 relative">
        {/* Loading overlay */}
        {isSaving && (
          <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 rounded-xl flex items-center justify-center z-10">
            <Loader2 className="h-6 w-6 text-primary-500 animate-spin" />
          </div>
        )}
        
        {/* Header */}
        <div className="flex items-start gap-3">
          {/* Drag handle */}
          <button
            type="button"
            onPointerDown={handlePointerDown}
            className={cn(
              'flex-shrink-0 p-1.5 -ml-1.5 rounded-md transition-colors',
              'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300',
              'hover:bg-gray-100 dark:hover:bg-gray-700/50',
              'cursor-grab active:cursor-grabbing',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
            )}
            aria-label="Drag to reorder"
          >
            <GripVertical className="w-4 h-4" />
          </button>

          {/* Platform icon and title */}
          <button
            type="button"
            onClick={() => onEdit(id)}
            className={cn(
              'flex-1 flex items-center gap-3 min-w-0',
              'text-left focus:outline-none',
              'group-hover:text-primary-600 dark:group-hover:text-primary-400',
              'transition-colors duration-200',
            )}
          >
            <div className={cn(
              'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
              'bg-white dark:bg-gray-700/80 shadow-sm',
              'border border-gray-100 dark:border-gray-600/50',
              'text-gray-700 dark:text-gray-200',
              'group-hover:shadow-md group-hover:scale-105',
              'transition-all duration-200',
            )}>
              <span className={cn(
                platformIcons[platform] || 'i-heroicons-link',
                'w-5 h-5',
                platform === 'tiktok' && 'text-black dark:text-white',
              )} />
            </div>

            <div className="min-w-0">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {title || platformName}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {displayUrl}
              </p>
            </div>
          </button>

          {/* Edit button */}
          <Tooltip content="Edit link" placement="top">
            <button
              type="button"
              onClick={handleEditClick}
              className={cn(
                'flex-shrink-0 p-1.5 rounded-md transition-colors',
                'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300',
                'hover:bg-gray-100 dark:hover:bg-gray-700/50',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                'group-hover:opacity-100 transition-opacity',
                isExpanded ? 'opacity-100' : 'opacity-0 md:opacity-0',
              )}
              aria-label="Edit link"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </Tooltip>

          {/* Toggle visibility */}
          <Tooltip content={isVisible ? 'Hide link' : 'Show link'} placement="top">
            <button
              type="button"
              onClick={() => onToggleVisibility(id)}
              className={cn(
                'flex-shrink-0 p-1.5 rounded-md transition-colors',
                'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300',
                'hover:bg-gray-100 dark:hover:bg-gray-700/50',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                isVisible && 'text-primary-600 dark:text-primary-400',
                'group-hover:opacity-100 transition-opacity',
                isExpanded ? 'opacity-100' : 'opacity-0 md:opacity-0',
              )}
              aria-label={isVisible ? 'Hide link' : 'Show link'}
              disabled={isSaving}
            >
              <Eye className={cn('w-4 h-4', !isVisible && 'opacity-50')} />
            </button>
          </Tooltip>

          {/* Expand/collapse button */}
          <button
            type="button"
            onClick={toggleExpanded}
            className={cn(
              'flex-shrink-0 p-1.5 -mr-1.5 rounded-md transition-all',
              'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300',
              'hover:bg-gray-100 dark:hover:bg-gray-700/50',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
              'transition-transform duration-200',
              isExpanded ? 'rotate-180' : 'rotate-0',
            )}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
            disabled={isSaving}
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>

        {/* Expanded content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700/50">
                <div className="flex items-center justify-between">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      'inline-flex items-center gap-1.5 text-sm text-primary-600 dark:text-primary-400',
                      'hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                      'transition-colors duration-200',
                    )}
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Visit link</span>
                  </a>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(id)}
                      className="text-sm"
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(id)}
                      className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Glow effect on hover */}
      <div 
        className={cn(
          'absolute inset-0 -z-10 rounded-xl opacity-0 group-hover:opacity-100',
          'bg-gradient-to-r from-primary-500/5 to-primary-400/5',
          'transition-opacity duration-200',
          'dark:from-primary-500/10 dark:to-primary-400/10',
        )}
      />
    </motion.div>
  );
}

export default LinkCard;
