'use client';

import { Button } from '@jovie/ui';
import { Input } from '@/components/atoms/Input';
import { CONTACT_TERRITORY_PRESETS } from '@/lib/contacts/constants';

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
  return (
    <div className='space-y-2'>
      <p className='text-xs font-semibold text-secondary-token uppercase'>
        Territories
      </p>
      <div className='flex flex-wrap gap-2'>
        {CONTACT_TERRITORY_PRESETS.map(territory => (
          <Button
            key={territory}
            type='button'
            size='sm'
            variant={territories.includes(territory) ? 'primary' : 'secondary'}
            onClick={() => onToggleTerritory(territory)}
          >
            {territory}
          </Button>
        ))}
        <div className='flex flex-col gap-2 w-full sm:flex-row sm:items-center sm:w-auto'>
          <Input
            placeholder='Add custom territory'
            value={customTerritory}
            onChange={event => onCustomTerritoryChange(event.target.value)}
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
