import {
  ChartBarIcon,
  LinkIcon,
  MusicalNoteIcon,
  ShareIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import React from 'react';
import { Button } from '@/components/atoms/Button';

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
      className={`bg-surface-1 border border-subtle rounded-xl p-8 text-center relative overflow-hidden ${className}`}
    >
      {/* Background gradient */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${config.gradient} opacity-50`}
      />

      {/* Content */}
      <div className='relative'>
        {/* Icon */}
        <div className='mx-auto mb-4 w-16 h-16 rounded-full bg-surface-2 flex items-center justify-center'>
          <IconComponent className='h-8 w-8 text-accent-token' />
        </div>

        {/* Title */}
        <h3 className='text-lg font-semibold text-primary mb-2'>
          {title || config.title}
        </h3>

        {/* Description */}
        <p className='text-secondary mb-6 max-w-md mx-auto'>
          {description || config.description}
        </p>

        {/* Action button */}
        {onAction && (
          <Button
            onClick={onAction}
            variant='primary'
            className='transform hover:scale-105 transition-transform duration-200'
          >
            {actionLabel || config.actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
