'use client';

import { useEffect, useState } from 'react';
import { useTableMeta } from '@/components/organisms/AuthShellWrapper';
import { PanelToggleButton } from './PanelToggleButton';

export function DrawerToggleButton() {
  const { tableMeta } = useTableMeta();
  const [isOpen, setIsOpen] = useState(false);

  // Track drawer open state based on rightPanelWidth
  useEffect(() => {
    setIsOpen((tableMeta.rightPanelWidth ?? 0) > 0);
  }, [tableMeta.rightPanelWidth]);

  return (
    <PanelToggleButton
      isOpen={isOpen}
      onToggle={() => tableMeta.toggle?.()}
      disabled={!tableMeta.toggle}
      ariaLabel='Toggle contact details'
    />
  );
}
