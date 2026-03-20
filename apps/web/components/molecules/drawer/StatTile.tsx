export interface StatTileProps {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
}

export function StatTile({ label, value, hint }: StatTileProps) {
  return (
    <div className='space-y-0.5'>
      <p className='text-[13px] font-[500] tracking-normal text-secondary-token'>
        {label}
      </p>
      <p className='tabular-nums text-[13px] font-semibold leading-none tracking-[-0.022em] text-primary-token'>
        {value}
      </p>
      {hint && <p className='text-[10px] text-tertiary-token'>{hint}</p>}
    </div>
  );
}
