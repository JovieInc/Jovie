import { Button } from '@jovie/ui';

const row: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  alignItems: 'center',
  flexWrap: 'wrap',
};

export function Default() {
  return <Button>Get started</Button>;
}

export function Variants() {
  return (
    <div style={row}>
      <Button variant='primary'>Primary</Button>
      <Button variant='secondary'>Secondary</Button>
      <Button variant='ghost'>Ghost</Button>
      <Button variant='outline'>Outline</Button>
    </div>
  );
}

export function Destructive() {
  return <Button variant='destructive'>Delete account</Button>;
}

export function Sizes() {
  return (
    <div style={row}>
      <Button size='sm'>Small</Button>
      <Button size='default'>Default</Button>
      <Button size='lg'>Large</Button>
    </div>
  );
}

export function Loading() {
  return (
    <Button loading disabled>
      Saving…
    </Button>
  );
}

export function Disabled() {
  return <Button disabled>Unavailable</Button>;
}
