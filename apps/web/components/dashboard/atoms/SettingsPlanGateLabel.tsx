export function SettingsPlanGateLabel({
  planName = 'Pro',
}: {
  readonly planName?: string;
}) {
  return (
    <span className='text-sm text-tertiary-token'>Available on {planName}</span>
  );
}
