import { Input, Label } from '@jovie/ui';

const field: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  maxWidth: 280,
};

export function Default() {
  return <Label>Display name</Label>;
}

export function WithInput() {
  return (
    <div style={field}>
      <Label htmlFor='email'>Email address</Label>
      <Input id='email' type='email' placeholder='you@example.com' />
    </div>
  );
}
