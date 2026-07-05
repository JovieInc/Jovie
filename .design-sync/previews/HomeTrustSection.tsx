// Authored preview — HomeTrustSection. The "distributed through" logo strip.
// Sweeps the presentation + variant axes. No props are required (sensible
// defaults), so each export is a distinct rendered configuration.
import { HomeTrustSection } from 'apps/web/components';

export function InlineStrip() {
  return (
    <HomeTrustSection
      presentation='inline-strip'
      label='Used by artists and teams with releases distributed through'
    />
  );
}

export function Card() {
  return (
    <HomeTrustSection
      presentation='card'
      label='Trusted by artists and teams releasing on'
    />
  );
}

export function Compact() {
  return <HomeTrustSection variant='compact' presentation='card' />;
}
