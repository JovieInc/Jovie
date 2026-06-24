import { Kbd } from '@jovie/ui';

const row: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  alignItems: 'center',
};

export function Shortcut() {
  return (
    <div style={row}>
      <Kbd>⌘</Kbd>
      <Kbd>K</Kbd>
    </div>
  );
}

export function Keys() {
  return (
    <div style={row}>
      <Kbd>⇧</Kbd>
      <Kbd>⌘</Kbd>
      <Kbd>P</Kbd>
    </div>
  );
}
