import { Input } from '@jovie/ui';

const col: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  maxWidth: 320,
};

export function Default() {
  return (
    <div style={col}>
      <Input placeholder='Search artists…' />
    </div>
  );
}

export function WithValue() {
  return (
    <div style={col}>
      <Input defaultValue='Calvin Harris' />
    </div>
  );
}

export function Error() {
  return (
    <div style={col}>
      <Input variant='error' defaultValue='not-an-email' />
    </div>
  );
}

export function Sizes() {
  return (
    <div style={col}>
      <Input inputSize='sm' placeholder='Small' />
      <Input inputSize='md' placeholder='Medium' />
      <Input inputSize='lg' placeholder='Large' />
    </div>
  );
}

export function Disabled() {
  return (
    <div style={col}>
      <Input disabled placeholder='Disabled' />
    </div>
  );
}
