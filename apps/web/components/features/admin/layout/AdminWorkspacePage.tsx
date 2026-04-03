import type { ReactNode } from 'react';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import {
  type WorkspaceTabOption,
  WorkspaceTabsSurface,
} from '@/components/organisms/WorkspaceTabsSurface';
import { cn } from '@/lib/utils';

interface AdminWorkspacePageProps<
  TPrimary extends string,
  TSecondary extends string = never,
> {
  readonly title: string;
  readonly description: string;
  readonly primaryParam: string;
  readonly primaryValue: TPrimary;
  readonly primaryOptions: readonly WorkspaceTabOption<TPrimary>[];
  readonly secondaryParam?: string;
  readonly secondaryValue?: TSecondary | null;
  readonly secondaryOptions?: readonly WorkspaceTabOption<TSecondary>[];
  readonly clearOnPrimaryChange?: readonly string[];
  readonly actions?: ReactNode;
  readonly testId: string;
  readonly viewTestId?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

export function AdminWorkspacePage<
  TPrimary extends string,
  TSecondary extends string = never,
>({
  title,
  description,
  primaryParam,
  primaryValue,
  primaryOptions,
  secondaryParam,
  secondaryValue,
  secondaryOptions,
  clearOnPrimaryChange,
  actions,
  testId,
  viewTestId,
  children,
  className,
}: Readonly<AdminWorkspacePageProps<TPrimary, TSecondary>>) {
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
          <WorkspaceTabsSurface
            title={title}
            description={description}
            primaryParam={primaryParam}
            primaryValue={primaryValue}
            primaryOptions={primaryOptions}
            secondaryParam={secondaryParam}
            secondaryValue={secondaryValue}
            secondaryOptions={secondaryOptions}
            clearOnPrimaryChange={clearOnPrimaryChange}
            actions={actions}
          >
            <div className='space-y-4' data-testid={viewTestId}>
              {children}
            </div>
          </WorkspaceTabsSurface>
        </div>
      </PageContent>
    </PageShell>
  );
}
