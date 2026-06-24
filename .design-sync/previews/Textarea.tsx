import { Textarea } from '@jovie/ui';

const col: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  maxWidth: 360,
};

export function Default() {
  return (
    <div style={col}>
      <Textarea placeholder='Write a short bio…' />
    </div>
  );
}

export function WithValue() {
  return (
    <div style={col}>
      <Textarea
        defaultValue={'Multi-platform artist.\nReleases every Friday.'}
      />
    </div>
  );
}

export function Error() {
  return (
    <div style={col}>
      <Textarea variant='error' defaultValue='Too short' />
    </div>
  );
}

export function Disabled() {
  return (
    <div style={col}>
      <Textarea disabled placeholder='Disabled' />
    </div>
  );
}
