export interface StatTileProps {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
}

export function StatTile({ label, value, hint }: StatTileProps) {
  return (
    <div className='space-y-0.5'>
      <p className='text-[11.5px] font-[510] tracking-normal text-secondary-token'>
        {label}
      </p>
      <p className='tabular-nums text-[14px] font-semibold leading-none tracking-[-0.02em] text-primary-token'>
        {value}
      </p>
      {hint && <p className='text-[10px] text-tertiary-token'>{hint}</p>}
    </div>
  );
}
