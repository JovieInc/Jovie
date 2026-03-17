'use client';

import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';

export interface SectionHeaderProps {
  readonly title: string;
  readonly description?: string;
  readonly right?: React.ReactNode;
  readonly className?: string;
}

export function SectionHeader({
  title,
  description,
  right,
  className,
}: SectionHeaderProps) {
  return (
    <ContentSectionHeader
      title={title}
      subtitle={description}
      actions={right}
      className={className}
      actionsClassName='shrink-0'
    />
  );
}
