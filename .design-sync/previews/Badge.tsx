import { Badge } from '@jovie/ui';

const row: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  flexWrap: 'wrap',
};

export function Variants() {
  return (
    <div style={row}>
      <Badge>Default</Badge>
      <Badge variant='secondary'>Secondary</Badge>
      <Badge variant='outline'>Outline</Badge>
    </div>
  );
}

export function Status() {
  return (
    <div style={row}>
      <Badge variant='success'>Live</Badge>
      <Badge variant='warning'>Pending</Badge>
      <Badge variant='destructive'>Failed</Badge>
    </div>
  );
}

export function Sizes() {
  return (
    <div style={row}>
      <Badge size='sm'>Small</Badge>
      <Badge size='md'>Medium</Badge>
      <Badge size='lg'>Large</Badge>
    </div>
  );
}
