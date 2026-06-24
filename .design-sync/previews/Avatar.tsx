import { Avatar, AvatarFallback, AvatarStatusDot } from '@jovie/ui';

const row: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  alignItems: 'center',
};

export function Default() {
  return (
    <Avatar>
      <AvatarFallback>TW</AvatarFallback>
    </Avatar>
  );
}

export function Sizes() {
  return (
    <div style={row}>
      <Avatar size='sm'>
        <AvatarFallback size='sm'>SM</AvatarFallback>
      </Avatar>
      <Avatar size='md'>
        <AvatarFallback size='md'>MD</AvatarFallback>
      </Avatar>
      <Avatar size='lg'>
        <AvatarFallback size='lg'>LG</AvatarFallback>
      </Avatar>
    </div>
  );
}

export function WithStatus() {
  return (
    <div style={row}>
      <Avatar>
        <AvatarFallback>ON</AvatarFallback>
        <AvatarStatusDot status='online' />
      </Avatar>
      <Avatar>
        <AvatarFallback>AW</AvatarFallback>
        <AvatarStatusDot status='away' />
      </Avatar>
      <Avatar>
        <AvatarFallback>OF</AvatarFallback>
        <AvatarStatusDot status='offline' />
      </Avatar>
    </div>
  );
}
