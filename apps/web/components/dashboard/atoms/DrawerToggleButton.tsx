'use client';

import { PanelRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTableMeta } from '@/components/organisms/AuthShellWrapper';
import { DashboardHeaderActionButton } from './DashboardHeaderActionButton';

export function DrawerToggleButton({
  className,
}: {
  readonly className?: string;
}) {
  const { tableMeta } = useTableMeta();
  const [isOpen, setIsOpen] = useState(false);

  // Track drawer open state based on rightPanelWidth
  useEffect(() => {
    setIsOpen((tableMeta.rightPanelWidth ?? 0) > 0);
  }, [tableMeta.rightPanelWidth]);

  // Hide when drawer is open — the drawer's X button handles closing
  if (isOpen) return null;

  const Icon = PanelRight;

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
