import { Checkbox, Label } from '@jovie/ui';

const row: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
};
const col: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

export function States() {
  return (
    <div style={col}>
      <div style={row}>
        <Checkbox id='c1' />
        <Label htmlFor='c1'>Unchecked</Label>
      </div>
      <div style={row}>
        <Checkbox id='c2' defaultChecked />
        <Label htmlFor='c2'>Checked</Label>
      </div>
      <div style={row}>
        <Checkbox id='c3' checked='indeterminate' />
        <Label htmlFor='c3'>Indeterminate</Label>
      </div>
    </div>
  );
}

export function Disabled() {
  return (
    <div style={row}>
      <Checkbox id='c4' disabled />
      <Label htmlFor='c4'>Disabled</Label>
    </div>
  );
}
