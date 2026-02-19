interface SettingsPlanGateLabelProps {
  readonly planName?: string;
}

export function SettingsPlanGateLabel({
  planName = 'Pro',
}: SettingsPlanGateLabelProps) {
  return (
    <span className='text-sm text-tertiary-token'>Available on {planName}</span>
  );
}
