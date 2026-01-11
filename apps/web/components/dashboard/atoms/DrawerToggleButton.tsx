'use client';

import { Button } from '@jovie/ui';
import { Users } from 'lucide-react';
import { useTableMeta } from '@/components/organisms/AuthShellWrapper';

export function DrawerToggleButton() {
  const { tableMeta } = useTableMeta();

  return (
    <Button
      variant='ghost'
      size='icon'
      onClick={() => tableMeta.toggle?.()}
      aria-label='Toggle contact details'
      className='h-9 w-9'
      disabled={!tableMeta.toggle}
    >
      <Users className='h-5 w-5' />
    </Button>
  );
}
