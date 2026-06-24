import { Skeleton } from '@jovie/ui';

export function Card() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxWidth: 280,
      }}
    >
      <Skeleton style={{ height: 120, width: '100%', borderRadius: 12 }} />
      <Skeleton style={{ height: 14, width: '70%' }} />
      <Skeleton style={{ height: 14, width: '45%' }} />
    </div>
  );
}

export function ListRow() {
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 280 }}
    >
      <Skeleton style={{ height: 40, width: 40, borderRadius: 9999 }} />
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}
      >
        <Skeleton style={{ height: 12, width: '60%' }} />
        <Skeleton style={{ height: 12, width: '40%' }} />
      </div>
    </div>
  );
}
