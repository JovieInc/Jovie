import { OverflowMenuTrigger } from '@jovie/ui';

const row: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  alignItems: 'center',
};

export function Default() {
  return (
    <div style={row}>
      <OverflowMenuTrigger hasActiveOverflow={false} />
    </div>
  );
}

export function WithActiveIndicator() {
  return (
    <div style={row}>
      <OverflowMenuTrigger hasActiveOverflow={true} />
    </div>
  );
}
