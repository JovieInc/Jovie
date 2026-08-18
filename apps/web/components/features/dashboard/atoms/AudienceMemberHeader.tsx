'use client';

import type { ReactNode } from 'react';
import {
  DrawerEntityAvatar,
  EntityHeaderCard,
} from '@/components/molecules/drawer';
import { cn } from '@/lib/utils';

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
      layout='grid'
      image={
        <DrawerEntityAvatar
          src={avatarSrc}
          name={avatarName}
          testId='audience-entity-avatar-frame'
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
      className={cn('px-2 py-2', className)}
      titleClassName='text-base leading-5 tracking-[-0.02em]'
      data-testid={testId}
    />
  );
}
