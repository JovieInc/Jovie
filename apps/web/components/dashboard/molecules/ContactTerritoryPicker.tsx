'use client';

import { Button } from '@jovie/ui';
import { memo, useCallback } from 'react';
import { Input } from '@/components/atoms/Input';
import { CONTACT_TERRITORY_PRESETS } from '@/lib/contacts/constants';

interface TerritoryButtonProps {
  territory: string;
  isSelected: boolean;
  onToggle: (territory: string) => void;
}

const TerritoryButton = memo(function TerritoryButton({
  territory,
  isSelected,
  onToggle,
}: TerritoryButtonProps) {
  const handleClick = useCallback(() => {
    onToggle(territory);
  }, [onToggle, territory]);

  return (
    <Button
      type='button'
      size='sm'
      variant={isSelected ? 'primary' : 'secondary'}
      onClick={handleClick}
    >
      {territory}
    </Button>
  );
});

export interface ContactTerritoryPickerProps {
  territories: string[];
  customTerritory: string;
  territorySummary: string;
  onToggleTerritory: (territory: string) => void;
  onCustomTerritoryChange: (value: string) => void;
  onAddCustomTerritory: () => void;
}

export function ContactTerritoryPicker({
  territories,
  customTerritory,
  territorySummary,
  onToggleTerritory,
  onCustomTerritoryChange,
  onAddCustomTerritory,
}: ContactTerritoryPickerProps) {
  const handleCustomTerritoryChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onCustomTerritoryChange(event.target.value);
    },
    [onCustomTerritoryChange]
  );

  return (
    <div className='space-y-2'>
      <p className='text-xs font-semibold text-secondary-token uppercase'>
        Territories
      </p>
      <div className='flex flex-wrap gap-2'>
        {CONTACT_TERRITORY_PRESETS.map(territory => (
          <TerritoryButton
            key={territory}
            territory={territory}
            isSelected={territories.includes(territory)}
            onToggle={onToggleTerritory}
          />
        ))}
        <div className='flex flex-col gap-2 w-full sm:flex-row sm:items-center sm:w-auto'>
          <Input
            placeholder='Add custom territory'
            value={customTerritory}
            onChange={handleCustomTerritoryChange}
            className='flex-1'
          />
          <Button
            size='sm'
            variant='ghost'
            onClick={onAddCustomTerritory}
            className='w-full sm:w-auto min-h-[44px]'
          >
            Add
          </Button>
        </div>
      </div>
      <p className='text-xs text-secondary-token'>
        {territorySummary === 'General'
          ? 'Add a region to speed up routing'
          : territorySummary}
      </p>
    </div>
  );
}
