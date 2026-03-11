export interface StatTileProps {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
}

export function StatTile({ label, value, hint }: StatTileProps) {
  return (
    <div className='space-y-1'>
      <p className='text-[10px] font-[510] uppercase tracking-[0.08em] text-(--linear-text-tertiary)'>
        {label}
      </p>
      <p className='tabular-nums text-[15px] font-[510] leading-none tracking-[-0.02em] text-(--linear-text-primary)'>
        {value}
      </p>
      {hint && (
        <p className='text-[11px] text-(--linear-text-secondary)'>{hint}</p>
      )}
    </div>
  );
}
