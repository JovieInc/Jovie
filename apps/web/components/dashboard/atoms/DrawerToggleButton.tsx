'use client';

import { PanelRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTableMeta } from '@/components/organisms/AuthShellWrapper';
import { PageToolbarActionButton } from '@/components/organisms/table';
import { DashboardHeaderActionButton } from './DashboardHeaderActionButton';

export function DrawerToggleButton({
  className,
  chrome = 'header',
}: {
  readonly className?: string;
  readonly chrome?: 'header' | 'page-toolbar';
}) {
  const { tableMeta } = useTableMeta();
  const [isOpen, setIsOpen] = useState(false);

  // Track drawer open state based on rightPanelWidth
  useEffect(() => {
    setIsOpen((tableMeta.rightPanelWidth ?? 0) > 0);
  }, [tableMeta.rightPanelWidth]);

  if (isOpen && chrome === 'header') return null;

  const Icon = PanelRight;

  if (chrome === 'page-toolbar') {
    return (
      <PageToolbarActionButton
        ariaLabel='Toggle details sidebar'
        label='Details'
        icon={<Icon className='h-3.5 w-3.5' />}
        iconOnly
        active={isOpen}
        ariaPressed={isOpen}
        disabled={!tableMeta.toggle}
        onClick={() => tableMeta.toggle?.()}
        tooltipLabel='Details'
        className={className}
      />
    );
  }

  return (
    <DashboardHeaderActionButton
      ariaLabel='Toggle contact details'
      pressed={isOpen}
      disabled={!tableMeta.toggle}
      onClick={() => tableMeta.toggle?.()}
      icon={<Icon className='h-4 w-4' />}
      className={className}
    />
  );
}
