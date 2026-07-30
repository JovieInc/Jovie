'use client';

import { PanelRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { RailToggleButton } from '@/components/atoms/RailToggleButton';
import { PageToolbarActionButton } from '@/components/organisms/table';
import { useTableMeta } from '@/contexts/TableMetaContext';

export function DrawerToggleButton({
  className,
  chrome = 'header',
  ariaLabel = 'Toggle details sidebar',
  label = 'Details',
  tooltipLabel = label,
}: {
  readonly className?: string;
  readonly chrome?: 'header' | 'page-toolbar';
  readonly ariaLabel?: string;
  readonly label?: string;
  readonly tooltipLabel?: string;
}) {
  const { tableMeta } = useTableMeta();
  const [isOpen, setIsOpen] = useState(false);

  // Track drawer open state based on rightPanelWidth
  useEffect(() => {
    setIsOpen((tableMeta.rightPanelWidth ?? 0) > 0);
  }, [tableMeta.rightPanelWidth]);

  const Icon = PanelRight;

  if (chrome === 'page-toolbar') {
    return (
      <PageToolbarActionButton
        ariaLabel={ariaLabel}
        label={label}
        icon={<Icon className='h-3.5 w-3.5' />}
        iconOnly
        active={isOpen}
        ariaPressed={isOpen}
        disabled={!tableMeta.toggle}
        onClick={() => tableMeta.toggle?.()}
        tooltipLabel={tooltipLabel}
        className={className}
      />
    );
  }

  return (
    <RailToggleButton
      side='right'
      open={isOpen}
      openLabel={ariaLabel}
      closedLabel={ariaLabel}
      disabled={!tableMeta.toggle}
      onToggle={() => tableMeta.toggle?.()}
      className={className}
    />
  );
}
