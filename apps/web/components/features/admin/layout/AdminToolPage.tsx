import type { ReactNode } from 'react';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import { cn } from '@/lib/utils';

interface AdminToolPageProps {
  readonly title?: string;
  readonly description?: string;
  readonly actions?: ReactNode;
  readonly testId: string;
  readonly children: ReactNode;
  readonly className?: string;
}

export function AdminToolPage({
  title,
  description,
  actions,
  testId,
  children,
  className,
}: AdminToolPageProps) {
  return (
    <PageShell>
      <PageContent noPadding>
        <div
          className={cn(
            'space-y-4 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)',
            className
          )}
          data-testid={testId}
        >
          {title || description ? (
            <ContentSurfaceCard className='overflow-hidden'>
              <ContentSectionHeader
                title={title}
                subtitle={description}
                actions={actions}
                className='min-h-0 px-(--linear-app-header-padding-x) py-3'
                actionsClassName='shrink-0'
              />
            </ContentSurfaceCard>
          ) : null}
          {children}
        </div>
      </PageContent>
    </PageShell>
  );
}
