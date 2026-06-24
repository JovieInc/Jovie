import { LoadingSkeleton } from '@jovie/ui';

// LoadingSkeleton sizes via Tailwind class props; rely on its in-package
// defaults (h-4 / w-full) and the `lines` feature, controlling outer width
// with a wrapper so custom utilities aren't required.
export function SingleLine() {
  return (
    <div style={{ width: 240 }}>
      <LoadingSkeleton />
    </div>
  );
}

export function MultiLine() {
  return (
    <div style={{ width: 280 }}>
      <LoadingSkeleton lines={3} />
    </div>
  );
}

export function Paragraph() {
  return (
    <div style={{ width: 320 }}>
      <LoadingSkeleton lines={5} />
    </div>
  );
}
