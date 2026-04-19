import type { ReactNode } from 'react';
import { DrawerInspectorGrid } from './DrawerInspectorGrid';
import { DrawerSection } from './DrawerSection';

export interface DrawerInspectorCardProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly actions?: ReactNode;
  readonly defaultOpen?: boolean;
  readonly collapsible?: boolean;
  readonly labelWidth?: number;
  readonly contentClassName?: string;
  readonly gridClassName?: string;
  readonly gridTestId?: string;
  readonly surfaceClassName?: string;
  readonly lazyMount?: boolean;
  readonly 'data-testid'?: string;
  readonly headingTestId?: string;
}

export function DrawerInspectorCard({
  title,
  children,
  actions,
  defaultOpen = true,
  collapsible = true,
  labelWidth,
  contentClassName,
  gridClassName,
  gridTestId,
  surfaceClassName,
  lazyMount,
  'data-testid': testId,
  headingTestId,
}: DrawerInspectorCardProps) {
  return (
    <DrawerSection
      title={title}
      actions={actions}
      surface='card'
      collapsible={collapsible}
      defaultOpen={defaultOpen}
      contentClassName={contentClassName}
      surfaceClassName={surfaceClassName}
      lazyMount={lazyMount}
      testId={testId}
      headingTestId={headingTestId}
    >
      <DrawerInspectorGrid
        labelWidth={labelWidth}
        className={gridClassName}
        data-testid={gridTestId}
      >
        {children}
      </DrawerInspectorGrid>
    </DrawerSection>
  );
}
