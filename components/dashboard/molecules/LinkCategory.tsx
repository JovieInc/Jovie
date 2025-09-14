'use client';

import { Button } from '@jovie/ui';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';
import { LinkCard } from './LinkCard';

type Platform =
  | 'instagram'
  | 'twitter'
  | 'tiktok'
  | 'youtube'
  | 'spotify'
  | 'applemusic'
  | 'custom';

export type LinkItem = {
  id: string;
  title: string;
  url: string;
  platform: Platform;
  isVisible: boolean;
};

type CategoryType = 'social' | 'music' | 'commerce' | 'other';

interface LinkCategoryProps {
  type: CategoryType;
  title: string;
  links: LinkItem[];
  onAddLink: () => void;
  onEditLink: (id: string) => void;
  onDeleteLink: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onDragStart: (e: React.PointerEvent, id: string) => void;
  isDraggingId?: string | null;
}

const categoryIcons: Record<CategoryType, IconName> = {
  social: 'Users',
  music: 'Music',
  commerce: 'DollarSign',
  other: 'Puzzle',
};

export function LinkCategory({
  type,
  title,
  links,
  onAddLink,
  onEditLink,
  onDeleteLink,
  onToggleVisibility,
  onDragStart,
  isDraggingId,
}: LinkCategoryProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const iconName: IconName = categoryIcons[type] ?? 'Link2';

  if (!links.length) return null;

  return (
    <div className='space-y-3'>
      {/* Category Header */}
      <div className='flex items-center justify-between'>
        <button
          type='button'
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            'group flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-md',
            'transition-colors duration-200'
          )}
        >
          <div
            className={cn(
              'p-1.5 rounded-lg',
              'bg-primary-50 dark:bg-primary-900/30',
              'text-primary-600 dark:text-primary-400',
              'group-hover:bg-primary-100 dark:group-hover:bg-primary-800/30',
              'transition-colors duration-200'
            )}
          >
            <Icon name={iconName} className='w-4 h-4' />
          </div>
          <span className='font-semibold'>{title}</span>
          <Icon
            name='ChevronDown'
            className={cn(
              'w-4 h-4 text-gray-400 transition-transform duration-200',
              isExpanded ? 'rotate-0' : '-rotate-90'
            )}
          />
          <span className='ml-1 text-xs font-normal text-gray-500 dark:text-gray-400'>
            {links.length} {links.length === 1 ? 'link' : 'links'}
          </span>
        </button>

        <Button
          variant='ghost'
          size='sm'
          onClick={onAddLink}
          className='text-sm whitespace-nowrap text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300'
        >
          <Icon name='Plus' className='w-4 h-4 mr-1' />
          Add Link
        </Button>
      </div>

      {/* Links List */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial='collapsed'
            animate='open'
            exit='collapsed'
            variants={{
              open: { opacity: 1, height: 'auto' },
              collapsed: { opacity: 0, height: 0 },
            }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className='space-y-3 overflow-hidden'
          >
            {links.map(link => (
              <LinkCard
                key={link.id}
                id={link.id}
                title={link.title}
                url={link.url}
                platform={link.platform}
                isVisible={link.isVisible}
                onEdit={onEditLink}
                onDelete={onDeleteLink}
                onToggleVisibility={onToggleVisibility}
                onDragStart={onDragStart}
                isDragging={isDraggingId === link.id}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
