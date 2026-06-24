import { Label, RadioGroup, RadioGroupItem } from '@jovie/ui';

const row: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
};

export function Default() {
  return (
    <RadioGroup
      defaultValue='pro'
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div style={row}>
        <RadioGroupItem value='free' id='r-free' />
        <Label htmlFor='r-free'>Free</Label>
      </div>
      <div style={row}>
        <RadioGroupItem value='pro' id='r-pro' />
        <Label htmlFor='r-pro'>Pro</Label>
      </div>
      <div style={row}>
        <RadioGroupItem value='max' id='r-max' />
        <Label htmlFor='r-max'>Max</Label>
      </div>
    </RadioGroup>
  );
}
