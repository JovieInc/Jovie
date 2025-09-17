'use client';

import {
  EyeIcon,
  EyeSlashIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@jovie/ui';
import * as React from 'react';
import { Badge } from '@/components/atoms/Badge';
import { Card } from '@/components/molecules/Card';
import { cn } from '@/lib/utils';

export interface LinkItemData {
  id: string;
  title: string;
  url: string;
  platform: string;
  isVisible: boolean;
  category: 'social' | 'music' | 'commerce' | 'other';
}

interface LinkItemProps {
  link: LinkItemData;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  isDragging?: boolean;
  dragProps?: React.HTMLAttributes<HTMLDivElement>;
}

const platformColors = {
  instagram: 'bg-pink-500',
  twitter: 'bg-blue-400',
  tiktok: 'bg-black',
  youtube: 'bg-red-500',
  spotify: 'bg-green-500',
  'apple-music': 'bg-black',
  custom: 'bg-gray-500',
} as const;

const platformLabels = {
  instagram: 'Instagram',
  twitter: 'Twitter',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  spotify: 'Spotify',
  'apple-music': 'Apple Music',
  custom: 'Custom',
} as const;

export function LinkItem({
  link,
  onEdit,
  onDelete,
  onToggleVisibility,
  isDragging = false,
  dragProps,
}: LinkItemProps) {
  const displayUrl = link.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const platformColor =
    platformColors[link.platform as keyof typeof platformColors] ||
    platformColors.custom;
  const platformLabel =
    platformLabels[link.platform as keyof typeof platformLabels] ||
    link.platform;

  return (
    <Card
      className={cn(
        'p-4 transition-all duration-200',
        'hover:shadow-md hover:border-border',
        isDragging && 'opacity-50 shadow-lg',
        !link.isVisible && 'opacity-60'
      )}
      {...dragProps}
    >
      <div className='flex items-center justify-between'>
        {/* Left side - Link info */}
        <div className='flex items-center gap-3 min-w-0 flex-1'>
          {/* Platform indicator */}
          <div className={cn('w-3 h-3 rounded-full', platformColor)} />

          {/* Link details */}
          <div className='min-w-0 flex-1'>
            <div className='flex items-center gap-2 mb-1'>
              <h3 className='font-medium text-primary-token truncate'>
                {link.title}
              </h3>
              <Badge variant='secondary' className='text-xs'>
                {platformLabel}
              </Badge>
              {!link.isVisible && (
                <Badge variant='warning' className='text-xs'>
                  Hidden
                </Badge>
              )}
            </div>
            <p className='text-sm text-secondary-token truncate'>
              {displayUrl}
            </p>
          </div>
        </div>

        {/* Right side - Actions */}
        <div className='flex items-center gap-1 ml-3'>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => onToggleVisibility(link.id)}
            className='h-8 w-8 p-0'
          >
            {link.isVisible ? (
              <EyeIcon className='h-4 w-4' />
            ) : (
              <EyeSlashIcon className='h-4 w-4' />
            )}
            <span className='sr-only'>
              {link.isVisible ? 'Hide link' : 'Show link'}
            </span>
          </Button>

          <Button
            variant='ghost'
            size='sm'
            onClick={() => onEdit(link.id)}
            className='h-8 w-8 p-0'
          >
            <PencilIcon className='h-4 w-4' />
            <span className='sr-only'>Edit link</span>
          </Button>

          <Button
            variant='ghost'
            size='sm'
            onClick={() => onDelete(link.id)}
            className='h-8 w-8 p-0 text-destructive hover:text-destructive'
          >
            <TrashIcon className='h-4 w-4' />
            <span className='sr-only'>Delete link</span>
          </Button>
        </div>
      </div>
    </Card>
  );
}
