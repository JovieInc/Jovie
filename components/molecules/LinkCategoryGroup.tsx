'use client';

import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import * as React from 'react';
import { AddLinkButton } from '@/components/atoms/AddLinkButton';
import { Badge } from '@/components/atoms/Badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/atoms/Collapsible';
import { type LinkItemData } from '@/components/atoms/LinkItem';
import { LinkList } from '@/components/molecules/LinkList';
import { cn } from '@/lib/utils';

type CategoryType = 'social' | 'music' | 'commerce' | 'other';

interface LinkCategoryGroupProps {
  category: CategoryType;
  title: string;
  links: LinkItemData[];
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
  onAddLink: () => void;
  onEditLink: (id: string) => void;
  onDeleteLink: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onReorderLinks: (links: LinkItemData[]) => void;
  className?: string;
}

const categoryIcons = {
  social: '👥',
  music: '🎵',
  commerce: '💰',
  other: '🔗',
} as const;

const categoryColors = {
  social: 'bg-blue-50 text-blue-700 border-blue-200',
  music: 'bg-purple-50 text-purple-700 border-purple-200',
  commerce: 'bg-green-50 text-green-700 border-green-200',
  other: 'bg-gray-50 text-gray-700 border-gray-200',
} as const;

export function LinkCategoryGroup({
  category,
  title,
  links,
  isExpanded = true,
  onToggleExpanded,
  onAddLink,
  onEditLink,
  onDeleteLink,
  onToggleVisibility,
  onReorderLinks,
  className,
}: LinkCategoryGroupProps) {
  const [expanded, setExpanded] = React.useState(isExpanded);

  const handleToggle = () => {
    if (onToggleExpanded) {
      onToggleExpanded();
    } else {
      setExpanded(!expanded);
    }
  };

  const effectiveExpanded = onToggleExpanded ? isExpanded : expanded;
  const categoryIcon = categoryIcons[category];
  const categoryColorClass = categoryColors[category];

  if (links.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-4', className)}>
      <Collapsible open={effectiveExpanded} onOpenChange={handleToggle}>
        {/* Category Header */}
        <div className='flex items-center justify-between'>
          <CollapsibleTrigger className='flex items-center gap-3 group hover:bg-muted/50 rounded-lg p-2 -m-2 transition-colors'>
            <div className='flex items-center gap-2'>
              <span className='text-lg'>{categoryIcon}</span>
              <h3 className='font-semibold text-primary-token'>{title}</h3>
              <Badge
                variant='secondary'
                className={cn('text-xs', categoryColorClass)}
              >
                {links.length}
              </Badge>
            </div>

            <div className='transition-transform duration-200 group-data-[state=closed]:rotate-0 group-data-[state=open]:rotate-90'>
              {effectiveExpanded ? (
                <ChevronDownIcon className='h-4 w-4 text-muted-foreground' />
              ) : (
                <ChevronRightIcon className='h-4 w-4 text-muted-foreground' />
              )}
            </div>
          </CollapsibleTrigger>

          <AddLinkButton
            onClick={onAddLink}
            variant='outline'
            size='sm'
            className='shrink-0'
          />
        </div>

        {/* Category Content */}
        <CollapsibleContent className='space-y-3'>
          <LinkList
            links={links}
            onEdit={onEditLink}
            onDelete={onDeleteLink}
            onToggleVisibility={onToggleVisibility}
            onReorder={onReorderLinks}
            emptyMessage={`No ${title.toLowerCase()} links yet. Add one to get started.`}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
