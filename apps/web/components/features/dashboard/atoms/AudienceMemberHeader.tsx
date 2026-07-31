'use client';

import type { ReactNode } from 'react';
import { Avatar } from '@/components/molecules/Avatar';
import { EntityHeaderCard } from '@/components/molecules/drawer';

export interface AudienceMemberHeaderProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly avatarName: string;
  readonly avatarSrc?: string | null;
  readonly meta?: ReactNode;
  readonly actions?: ReactNode;
  readonly className?: string;
  readonly 'data-testid'?: string;
}

export function AudienceMemberHeader({
  title,
  subtitle,
  avatarName,
  avatarSrc,
  meta,
  actions,
  className,
  'data-testid': testId,
}: AudienceMemberHeaderProps) {
  return (
    <EntityHeaderCard
      image={
        <Avatar
          src={avatarSrc}
          alt={title ? `${title} avatar` : 'Audience member avatar'}
          name={avatarName}
          size='md'
        />
      }
      title={title}
      subtitle={subtitle}
      meta={meta}
      actions={actions}
      stableLayout
      titleLineClamp={1}
      subtitleLineClamp={1}
      reserveSubtitleSlot
      reserveMetaSlot
      metaOverflow='scroll'
      className={className}
      bodyClassName='pr-9'
      data-testid={testId}
    />
  );
}
