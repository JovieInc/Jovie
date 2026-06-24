import { Switch } from '@jovie/ui';

const row: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  alignItems: 'center',
};

export function States() {
  return (
    <div style={row}>
      <Switch aria-label='Off' />
      <Switch defaultChecked aria-label='On' />
    </div>
  );
}

export function Disabled() {
  return (
    <div style={row}>
      <Switch disabled aria-label='Disabled off' />
      <Switch disabled defaultChecked aria-label='Disabled on' />
    </div>
  );
}
