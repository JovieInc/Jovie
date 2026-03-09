export interface StatTileProps {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
}

export function StatTile({ label, value, hint }: StatTileProps) {
  return (
    <div className='space-y-1'>
      <p className='text-[10px] font-[510] uppercase tracking-[0.08em] text-tertiary-token'>
        {label}
      </p>
      <p className='text-xl font-[510] leading-none tracking-tight text-primary-token tabular-nums'>
        {value}
      </p>
      {hint && <p className='text-[11px] text-secondary-token'>{hint}</p>}
    </div>
  );
}
