import { Separator } from '@jovie/ui';

export function Horizontal() {
  return (
    <div style={{ maxWidth: 280 }}>
      <div style={{ paddingBottom: 12 }}>Profile</div>
      <Separator />
      <div style={{ paddingTop: 12 }}>Billing</div>
    </div>
  );
}

export function Vertical() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 24 }}>
      <span>Docs</span>
      <Separator orientation='vertical' />
      <span>API</span>
      <Separator orientation='vertical' />
      <span>Support</span>
    </div>
  );
}
