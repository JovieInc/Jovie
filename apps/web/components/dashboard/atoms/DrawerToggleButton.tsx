'use client';

import { Button } from '@jovie/ui';
import { PanelRight, PanelRightOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTableMeta } from '@/components/organisms/AuthShellWrapper';

export function DrawerToggleButton() {
  const { tableMeta } = useTableMeta();
  const [isOpen, setIsOpen] = useState(false);

  // Track drawer open state based on rightPanelWidth
  useEffect(() => {
    setIsOpen((tableMeta.rightPanelWidth ?? 0) > 0);
  }, [tableMeta.rightPanelWidth]);

  const Icon = isOpen ? PanelRightOpen : PanelRight;

  return (
    <Button
      variant='ghost'
      size='icon'
      onClick={() => tableMeta.toggle?.()}
      aria-label='Toggle contact details'
      className='h-8 w-8 border-none'
      disabled={!tableMeta.toggle}
    >
      <Icon className='h-4 w-4' />
    </Button>
  );
}
