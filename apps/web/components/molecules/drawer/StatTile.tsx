import { DrawerSectionHeading } from './DrawerSectionHeading';

export interface StatTileProps {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
}

export function StatTile({ label, value, hint }: StatTileProps) {
  return (
    <div className='space-y-1.5'>
      <DrawerSectionHeading as='p' className='text-[10.5px] tracking-[0.08em]'>
        {label}
      </DrawerSectionHeading>
      <p className='tabular-nums text-[18px] font-[510] leading-none tracking-[-0.022em] text-(--linear-text-primary)'>
        {value}
      </p>
      {hint && (
        <p className='text-[12px] text-(--linear-text-secondary)'>{hint}</p>
      )}
    </div>
  );
}
