'use client';

import { PanelRight, PanelRightOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTableMeta } from '@/components/organisms/AuthShellWrapper';
import { DashboardHeaderActionButton } from './DashboardHeaderActionButton';

export function DrawerToggleButton() {
  const { tableMeta } = useTableMeta();
  const [isOpen, setIsOpen] = useState(false);

  // Track drawer open state based on rightPanelWidth
  useEffect(() => {
    setIsOpen((tableMeta.rightPanelWidth ?? 0) > 0);
  }, [tableMeta.rightPanelWidth]);

  const Icon = isOpen ? PanelRightOpen : PanelRight;

  return (
    <DashboardHeaderActionButton
      ariaLabel='Toggle contact details'
      pressed={isOpen}
      disabled={!tableMeta.toggle}
      onClick={() => tableMeta.toggle?.()}
      icon={<Icon />}
    />
  );
}
