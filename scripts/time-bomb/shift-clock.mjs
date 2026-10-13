// Preload (`NODE_OPTIONS=--import=<abs path>`) that runs a process with the wall
// clock moved TIME_SHIFT_DAYS ahead: `new Date()`, `Date()` and `Date.now()`.
// Explicit dates, Date.parse/UTC and fake timers are untouched, so only tests
// that read the real clock move. Used by scripts/time-bomb/scan.mjs to surface
// tests that will fail on a future date (2026-10-13: an expiring fixture brief
// in tests/unit/ovie/mcp-handler.test.ts turned main red at 00:00Z).

const days = Number(process.env.TIME_SHIFT_DAYS ?? 0);
const shift = Number.isFinite(days) ? days * 86_400_000 : 0;

if (shift !== 0 && !globalThis.__jovieClockShift) {
  const RealDate = globalThis.Date;
  const now = () => RealDate.now() + shift;
  globalThis.Date = new Proxy(RealDate, {
    construct(target, args, newTarget) {
      return Reflect.construct(
        target,
        args.length === 0 ? [now()] : args,
        newTarget
      );
    },
    apply() {
      return new RealDate(now()).toString();
    },
    get(target, property, receiver) {
      if (property === 'now') return now;
      return Reflect.get(target, property, receiver);
    },
  });
  globalThis.__jovieClockShift = shift;
}
