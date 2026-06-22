export interface StatTileProps {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
}

export function StatTile({ label, value, hint }: StatTileProps) {
  return (
    <div className='space-y-0.5'>
      <p className='text-2xs font-caption tracking-normal text-secondary-token'>
        {label}
      </p>
      <p className='tabular-nums text-sm font-semibold leading-none tracking-tighter text-primary-token'>
        {value}
      </p>
      {hint && <p className='text-3xs text-tertiary-token'>{hint}</p>}
    </div>
  );
}
