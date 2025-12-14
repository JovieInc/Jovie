import {
  ChartBarIcon,
  LinkIcon,
  MusicalNoteIcon,
  ShareIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@jovie/ui';
import React from 'react';

interface EmptyStateProps {
  type: 'music' | 'social' | 'links' | 'analytics' | 'general';
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

const EMPTY_STATE_CONFIG = {
  music: {
    icon: MusicalNoteIcon,
    title: '🎵 Add your first music link',
    description:
      'Connect your Spotify, Apple Music, or SoundCloud to let fans listen instantly.',
    actionLabel: 'Add Music Link',
    gradient: 'from-purple-500/10 to-pink-500/10',
  },
  social: {
    icon: ShareIcon,
    title: '📱 Connect your socials',
    description:
      'Link your Instagram, TikTok, and Twitter to build your fan community.',
    actionLabel: 'Add Social Link',
    gradient: 'from-blue-500/10 to-cyan-500/10',
  },
  links: {
    icon: LinkIcon,
    title: '🔗 No links added yet',
    description:
      'Start building your link hub by adding your most important links.',
    actionLabel: 'Add Your First Link',
    gradient: 'from-indigo-500/10 to-purple-500/10',
  },
  analytics: {
    icon: ChartBarIcon,
    title: '📊 No data yet',
    description:
      'Share your profile link to start tracking clicks and engagement.',
    actionLabel: 'Copy Profile Link',
    gradient: 'from-green-500/10 to-emerald-500/10',
  },
  general: {
    icon: SparklesIcon,
    title: '✨ Nothing here yet',
    description: 'Get started by adding your content.',
    actionLabel: 'Get Started',
    gradient: 'from-gray-500/10 to-slate-500/10',
  },
} as const;

export function EmptyState({
  type,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}: EmptyStateProps) {
  const config = EMPTY_STATE_CONFIG[type];
  const IconComponent = config.icon;

  return (
    <div
      className={`rounded-2xl border border-subtle bg-surface-1/40 p-6 text-center ${className}`}
    >
      <div className='mx-auto flex max-w-lg flex-col items-center gap-3'>
        <div className='flex h-10 w-10 items-center justify-center rounded-xl border border-subtle bg-surface-1'>
          <IconComponent className='h-5 w-5 text-secondary-token' />
        </div>

        <div className='space-y-1'>
          <h3 className='text-[14px] font-semibold leading-5 text-primary-token'>
            {title || config.title}
          </h3>
          <p className='text-[13px] leading-5 text-secondary-token'>
            {description || config.description}
          </p>
        </div>

        {onAction && (
          <Button
            onClick={onAction}
            variant='secondary'
            size='sm'
            className='rounded-md px-3 text-[13px] font-semibold'
          >
            {actionLabel || config.actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
