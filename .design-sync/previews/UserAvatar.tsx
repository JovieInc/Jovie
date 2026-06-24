import { UserAvatar } from '@jovie/ui';

const row: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  alignItems: 'center',
};

export function Default() {
  return <UserAvatar name='Calvin Harris' />;
}

export function WithStatus() {
  return (
    <div style={row}>
      <UserAvatar name='Tim White' status='online' />
      <UserAvatar name='Dua Lipa' status='away' />
      <UserAvatar name='Fred Again' status='offline' />
    </div>
  );
}

export function Sizes() {
  return (
    <div style={row}>
      <UserAvatar name='Calvin Harris' size='sm' />
      <UserAvatar name='Calvin Harris' size='md' />
      <UserAvatar name='Calvin Harris' size='lg' />
    </div>
  );
}
