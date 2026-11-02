import { describe, expect, it } from 'vitest';
import { DialEngine, type DialScheduler, type DialState } from './dial-engine';

/** Deterministic clock + rAF: advance time in explicit frames. */
class FakeClock implements DialScheduler {
  time = 0;
  private nextHandle = 1;
  private readonly pending = new Map<number, (time: number) => void>();
  now(): number {
    return this.time;
  }
  request(callback: (time: number) => void): number {
    const handle = this.nextHandle++;
    this.pending.set(handle, callback);
    return handle;
  }
  cancel(handle: number): void {
    this.pending.delete(handle);
  }
  get queued(): number {
    return this.pending.size;
  }
  /** Run `ms` of frames at `frame` ms apiece. */
  advance(ms: number, frame = 16): void {
    const end = this.time + ms;
    while (this.time < end) {
      this.time = Math.min(end, this.time + frame);
      const callbacks = [...this.pending.entries()];
      this.pending.clear();
      for (const [, callback] of callbacks) callback(this.time);
    }
  }
}

function setup(count = 100, position = 0, reducedMotion = false) {
  const clock = new FakeClock();
  const frames: Array<{ position: number; state: DialState }> = [];
  const ticks: number[] = [];
  const rests: number[] = [];
  const engine = new DialEngine({
    count,
    position,
    reducedMotion,
    scheduler: clock,
    onFrame: (p, state) => frames.push({ position: p, state }),
    onIndexChange: i => ticks.push(i),
    onRest: i => rests.push(i),
  });
  return { clock, engine, frames, ticks, rests };
}

/** Finger travelling `items` over `ms` in 8ms (120Hz) steps, then lifting. */
function swipe(
  ctx: ReturnType<typeof setup>,
  items: number,
  ms: number,
  lift = true
) {
  const { engine, clock } = ctx;
  engine.grab();
  const steps = Math.max(1, Math.round(ms / 8));
  for (let step = 1; step <= steps; step++) {
    clock.time += ms / steps;
    engine.drag((items * step) / steps);
  }
  if (lift) engine.release();
}

describe('DialEngine drag and release', () => {
  it('follows the finger one-to-one inside the list', () => {
    const ctx = setup(100, 10);
    ctx.engine.grab();
    ctx.clock.time = 16;
    ctx.engine.drag(2.5);
    expect(ctx.engine.currentPosition).toBeCloseTo(12.5, 12);
    expect(ctx.engine.currentState).toBe('drag');
    expect(ctx.engine.index).toBe(13);
  });
  it('ticks once per item crossed, in order, even at frame-skipping speed', () => {
    const ctx = setup(100, 0);
    ctx.engine.grab();
    ctx.clock.time = 16;
    ctx.engine.drag(1.2);
    ctx.clock.time = 32;
    ctx.engine.drag(3.6);
    expect(ctx.ticks).toEqual([1, 4]);
    ctx.clock.time = 48;
    ctx.engine.drag(2.4);
    expect(ctx.ticks).toEqual([1, 4, 2]);
  });
  it('snaps a slow drag to the nearest item and reports rest once', () => {
    const ctx = setup(100, 10);
    swipe(ctx, 0.62, 400, false);
    ctx.clock.time += 120; // finger rests before lifting: no throw
    ctx.engine.release();
    ctx.clock.advance(1500);
    expect(ctx.engine.currentPosition).toBe(11);
    expect(ctx.engine.currentState).toBe('idle');
    expect(ctx.rests).toEqual([11]);
  });
  it('returns to the start item for a drag short of halfway', () => {
    const ctx = setup(100, 10);
    swipe(ctx, 0.3, 400, false);
    ctx.clock.time += 120;
    ctx.engine.release();
    ctx.clock.advance(1500);
    expect(ctx.engine.currentPosition).toBe(10);
    expect(ctx.rests).toEqual([10]);
  });
  it('throws: a fast flick travels the UIScrollView projection and lands on an item', () => {
    const ctx = setup(100, 0);
    // 5 items in 100ms = 0.05 items/ms -> projection 24.95 items.
    swipe(ctx, 5, 100);
    const target = ctx.engine.targetIndex;
    expect(target).toBe(Math.round(5 + 0.05 * 499));
    ctx.clock.advance(6000);
    expect(ctx.engine.currentState).toBe('idle');
    expect(ctx.engine.currentPosition).toBe(target);
    expect(ctx.rests).toEqual([target]);
    // Every item along the way ticked exactly once, ascending.
    expect(ctx.ticks).toEqual(Array.from({ length: target }, (_, i) => i + 1));
  });
  it('throws backwards symmetrically', () => {
    const ctx = setup(100, 80);
    swipe(ctx, -5, 100);
    const target = ctx.engine.targetIndex;
    expect(target).toBe(Math.round(75 - 0.05 * 499));
    ctx.clock.advance(6000);
    expect(ctx.engine.currentPosition).toBe(target);
  });
  it('keeps frame steps small at 120Hz so motion never jumps a row', () => {
    const ctx = setup(100, 0);
    swipe(ctx, 3, 100);
    ctx.frames.length = 0;
    ctx.clock.advance(3000, 8);
    let previous = ctx.frames[0]!.position;
    for (const { position } of ctx.frames) {
      expect(Math.abs(position - previous)).toBeLessThan(0.5);
      previous = position;
    }
  });
  it('rests only on whole items and never moves again', () => {
    const ctx = setup(100, 0);
    swipe(ctx, 4, 90);
    ctx.clock.advance(6000);
    const final = ctx.engine.currentPosition;
    expect(Number.isInteger(final)).toBe(true);
    expect(ctx.clock.queued).toBe(0);
    ctx.clock.advance(1000);
    expect(ctx.engine.currentPosition).toBe(final);
  });
});

describe('DialEngine ends', () => {
  it('rubber-bands a drag past the first item', () => {
    const ctx = setup(100, 0);
    ctx.engine.grab();
    ctx.clock.time = 16;
    ctx.engine.drag(-3);
    expect(ctx.engine.currentPosition).toBeLessThan(0);
    expect(ctx.engine.currentPosition).toBeGreaterThan(-2);
    expect(ctx.engine.currentPosition).toBeGreaterThan(-3);
    expect(ctx.engine.index).toBe(0);
  });
  it('rubber-bands past the last item', () => {
    const ctx = setup(100, 99);
    ctx.engine.grab();
    ctx.clock.time = 16;
    ctx.engine.drag(5);
    expect(ctx.engine.currentPosition).toBeGreaterThan(99);
    expect(ctx.engine.currentPosition).toBeLessThan(101);
    expect(ctx.engine.index).toBe(99);
  });
  it('springs back to the end item on release', () => {
    const ctx = setup(100, 0);
    swipe(ctx, -1.5, 300, false);
    ctx.clock.time += 120;
    ctx.engine.release();
    ctx.clock.advance(2000);
    expect(ctx.engine.currentPosition).toBe(0);
    expect(ctx.rests).toEqual([0]);
  });
  it('grabbing mid-bounce does not jump the dial', () => {
    const ctx = setup(100, 0);
    swipe(ctx, -1.5, 300, false);
    ctx.clock.time += 120;
    ctx.engine.release();
    ctx.clock.advance(64);
    const during = ctx.engine.currentPosition;
    expect(during).toBeLessThan(0);
    ctx.engine.grab();
    expect(ctx.engine.currentPosition).toBe(during);
    ctx.clock.time += 16;
    ctx.engine.drag(0);
    expect(ctx.engine.currentPosition).toBeCloseTo(during, 9);
  });
  it('a throw into the end settles on the last item', () => {
    const ctx = setup(30, 20);
    swipe(ctx, 6, 80);
    ctx.clock.advance(6000);
    expect(ctx.engine.currentPosition).toBe(29);
    expect(ctx.rests.at(-1)).toBe(29);
  });
});

describe('DialEngine interruption', () => {
  it('stops momentum on the spot when grabbed, and reports no rest', () => {
    const ctx = setup(100, 0);
    swipe(ctx, 5, 100);
    ctx.clock.advance(300);
    const caught = ctx.engine.currentPosition;
    expect(caught).toBeGreaterThan(5);
    ctx.engine.grab();
    expect(ctx.engine.currentState).toBe('drag');
    expect(ctx.clock.queued).toBe(0);
    ctx.clock.advance(1000);
    expect(ctx.engine.currentPosition).toBe(caught);
    expect(ctx.rests).toEqual([]);
  });
  it('settles on the nearest item after catching a fling with a still finger', () => {
    const ctx = setup(100, 0);
    swipe(ctx, 5, 100);
    ctx.clock.advance(300);
    const caught = ctx.engine.currentPosition;
    ctx.engine.grab();
    ctx.clock.time += 100;
    ctx.engine.release();
    ctx.clock.advance(1500);
    expect(ctx.engine.currentPosition).toBe(Math.round(caught));
    expect(ctx.rests).toEqual([Math.round(caught)]);
  });
  it('lets a second throw start from where the first was caught', () => {
    const ctx = setup(100, 0);
    swipe(ctx, 5, 100);
    ctx.clock.advance(300);
    const caught = ctx.engine.currentPosition;
    swipe(ctx, 5, 100);
    expect(ctx.engine.targetIndex).toBeGreaterThan(Math.round(caught) + 20);
  });
  it('cancel settles without a throw', () => {
    const ctx = setup(100, 10);
    swipe(ctx, 4, 100, false);
    ctx.engine.cancel();
    expect(ctx.engine.targetIndex).toBe(14);
    ctx.clock.advance(1500);
    expect(ctx.engine.currentPosition).toBe(14);
  });
  it('ignores drag, release and cancel when nothing is held', () => {
    const ctx = setup(100, 10);
    ctx.engine.drag(5);
    ctx.engine.release();
    ctx.engine.cancel();
    expect(ctx.engine.currentPosition).toBe(10);
    expect(ctx.frames).toEqual([]);
  });
});

describe('DialEngine moveTo', () => {
  it('animates to an item with a short critically damped snap', () => {
    const ctx = setup(100, 0);
    ctx.engine.moveTo(1);
    expect(ctx.engine.targetIndex).toBe(1);
    ctx.clock.advance(120);
    expect(ctx.engine.currentPosition).toBeGreaterThan(0.3);
    ctx.clock.advance(700);
    expect(ctx.engine.currentPosition).toBe(1);
    expect(ctx.rests).toEqual([1]);
    expect(ctx.ticks).toEqual([1]);
  });
  it('clamps and rounds the requested item', () => {
    const ctx = setup(10, 0);
    ctx.engine.moveTo(99);
    expect(ctx.engine.targetIndex).toBe(9);
    ctx.engine.moveTo(-5);
    expect(ctx.engine.targetIndex).toBe(0);
    ctx.engine.moveTo(3.4);
    expect(ctx.engine.targetIndex).toBe(3);
  });
  it('chains keyboard steps from the pending target', () => {
    const ctx = setup(100, 0);
    ctx.engine.moveTo(ctx.engine.targetIndex + 1);
    ctx.clock.advance(40);
    ctx.engine.moveTo(ctx.engine.targetIndex + 1);
    ctx.engine.moveTo(ctx.engine.targetIndex + 1);
    expect(ctx.engine.targetIndex).toBe(3);
    ctx.clock.advance(2000);
    expect(ctx.engine.currentPosition).toBe(3);
    expect(ctx.rests).toEqual([3]);
  });
  it('is Home/End friendly: spans the whole list, ticking ascending to the end', () => {
    const ctx = setup(100, 0);
    ctx.engine.moveTo(99);
    ctx.clock.advance(6000);
    expect(ctx.engine.currentPosition).toBe(99);
    expect(ctx.ticks.at(-1)).toBe(99);
    expect([...ctx.ticks].sort((a, b) => a - b)).toEqual(ctx.ticks);
    expect(new Set(ctx.ticks).size).toBe(ctx.ticks.length);
  });
});

describe('DialEngine reduced motion', () => {
  it('snaps a release instantly with no animation frames queued', () => {
    const ctx = setup(100, 0, true);
    swipe(ctx, 5, 100);
    expect(ctx.engine.currentState).toBe('idle');
    expect(ctx.clock.queued).toBe(0);
    expect(ctx.engine.currentPosition).toBe(Math.round(5 + 0.05 * 499));
    expect(ctx.rests).toHaveLength(1);
  });
  it('moves to an item instantly', () => {
    const ctx = setup(100, 0, true);
    ctx.engine.moveTo(7);
    expect(ctx.engine.currentPosition).toBe(7);
    expect(ctx.rests).toEqual([7]);
    expect(ctx.clock.queued).toBe(0);
  });
  it('can be toggled live', () => {
    const ctx = setup(100, 0, true);
    ctx.engine.setReducedMotion(false);
    ctx.engine.moveTo(2);
    expect(ctx.engine.currentState).toBe('release');
  });
});

describe('DialEngine wheel', () => {
  it('tracks trackpad deltas, then snaps after the stream goes quiet', () => {
    const ctx = setup(100, 10);
    ctx.engine.wheel(0.4);
    ctx.clock.advance(16);
    ctx.engine.wheel(0.4);
    expect(ctx.engine.currentPosition).toBeCloseTo(10.8, 9);
    expect(ctx.engine.currentState).toBe('drag');
    ctx.clock.advance(1500);
    expect(ctx.engine.currentPosition).toBe(11);
    expect(ctx.rests).toEqual([11]);
  });
  it('rubber-bands the wheel at the ends', () => {
    const ctx = setup(100, 0);
    ctx.engine.wheel(-3);
    expect(ctx.engine.currentPosition).toBeLessThan(0);
    expect(ctx.engine.currentPosition).toBeGreaterThan(-2);
    ctx.clock.advance(1500);
    expect(ctx.engine.currentPosition).toBe(0);
  });
  it('is interrupted by a pointer grab', () => {
    const ctx = setup(100, 10);
    ctx.engine.wheel(0.4);
    ctx.engine.grab();
    ctx.clock.advance(500);
    expect(ctx.engine.currentPosition).toBeCloseTo(10.4, 9);
    expect(ctx.engine.currentState).toBe('drag');
  });
});

describe('DialEngine lifecycle', () => {
  it('handles an empty or single-item list without moving', () => {
    const empty = setup(0, 0);
    swipe(empty, 5, 100);
    empty.clock.advance(2000);
    expect(empty.engine.currentPosition).toBe(0);
    const single = setup(1, 0);
    swipe(single, 5, 100);
    single.clock.advance(3000);
    expect(single.engine.currentPosition).toBe(0);
  });
  it('jumpTo only applies while idle', () => {
    const ctx = setup(100, 0);
    ctx.engine.jumpTo(40);
    expect(ctx.engine.currentPosition).toBe(40);
    ctx.engine.moveTo(50);
    ctx.engine.jumpTo(10);
    expect(ctx.engine.currentState).toBe('release');
    ctx.clock.advance(2000);
    expect(ctx.engine.currentPosition).toBe(50);
  });
  it('setCount re-clamps an idle position', () => {
    const ctx = setup(100, 80);
    ctx.engine.setCount(10);
    expect(ctx.engine.currentPosition).toBe(9);
  });
  it('destroy cancels the loop', () => {
    const ctx = setup(100, 0);
    ctx.engine.moveTo(5);
    ctx.engine.destroy();
    expect(ctx.clock.queued).toBe(0);
    expect(ctx.engine.currentState).toBe('idle');
  });
});

describe('DialEngine state reporting', () => {
  it('reports the drag state as soon as the dial is grabbed', () => {
    const ctx = setup(100, 5);
    ctx.engine.moveTo(9);
    ctx.clock.advance(100);
    ctx.frames.length = 0;
    ctx.engine.grab();
    expect(ctx.frames.at(-1)?.state).toBe('drag');
  });
});

describe('DialEngine construction and bounds', () => {
  const quiet = {
    scheduler: new FakeClock(),
    onFrame: () => {},
    onIndexChange: () => {},
    onRest: () => {},
  };
  it('animates by default and clamps the starting position into the list', () => {
    const engine = new DialEngine({ ...quiet, count: 10, position: 500 });
    expect(engine.currentPosition).toBe(9);
    engine.moveTo(2);
    expect(engine.currentState).toBe('release');
  });
  it('starts at the first item without a position', () => {
    const engine = new DialEngine({ ...quiet, count: 10 });
    expect(engine.currentPosition).toBe(0);
  });
  it('jumpTo clamps to the last item and emits one frame and one tick', () => {
    const ctx = setup(100, 0);
    ctx.engine.jumpTo(500);
    expect(ctx.engine.currentPosition).toBe(99);
    expect(ctx.frames.at(-1)).toEqual({ position: 99, state: 'idle' });
    expect(ctx.ticks).toEqual([99]);
    ctx.engine.jumpTo(-4);
    expect(ctx.engine.currentPosition).toBe(0);
  });
  it('setCount emits the re-clamped position as an idle frame and a tick', () => {
    const ctx = setup(100, 80);
    ctx.engine.setCount(10);
    expect(ctx.frames.at(-1)).toEqual({ position: 9, state: 'idle' });
    expect(ctx.ticks).toEqual([9]);
    ctx.engine.setCount(-3);
    expect(ctx.engine.currentPosition).toBe(0);
  });
  it('setCount leaves a held dial alone', () => {
    const ctx = setup(100, 80);
    ctx.engine.grab();
    ctx.frames.length = 0;
    ctx.engine.setCount(10);
    expect(ctx.frames).toEqual([]);
  });
});

describe('DialEngine frame states', () => {
  it('reports release when a curve starts and idle once at rest', () => {
    const ctx = setup(100, 0);
    ctx.engine.moveTo(3);
    expect(ctx.frames.at(-1)?.state).toBe('release');
    ctx.clock.advance(3000);
    expect(ctx.frames.at(-1)).toEqual({ position: 3, state: 'idle' });
    expect(ctx.frames.filter(f => f.state === 'idle')).toHaveLength(1);
    expect(ctx.rests).toEqual([3]);
  });
  it('ignores release and cancel unless a pointer is held', () => {
    const ctx = setup(100, 0);
    ctx.engine.moveTo(5);
    ctx.frames.length = 0;
    ctx.engine.release();
    ctx.engine.cancel();
    expect(ctx.frames).toEqual([]);
    expect(ctx.engine.targetIndex).toBe(5);
    ctx.clock.advance(3000);
    expect(ctx.rests).toEqual([5]);
  });
  it('starts the curve on its first frame so a foreign frame clock cannot stall it', () => {
    const ctx = setup(100, 0);
    ctx.engine.moveTo(1);
    ctx.clock.time = 5_000_000;
    ctx.clock.advance(1500);
    expect(ctx.engine.currentPosition).toBe(1);
    expect(ctx.rests).toEqual([1]);
  });
  it('does not tick on moveTo to the item already centered', () => {
    const ctx = setup(100, 4);
    ctx.engine.moveTo(4);
    ctx.clock.advance(1000);
    expect(ctx.ticks).toEqual([]);
    expect(ctx.rests).toEqual([4]);
  });
});

describe('DialEngine wheel idle detection', () => {
  it('holds through 90ms of silence and releases after it', () => {
    const ctx = setup(100, 10);
    ctx.engine.wheel(0.3);
    ctx.clock.advance(90, 1);
    expect(ctx.engine.currentState).toBe('drag');
    ctx.clock.advance(2, 1);
    expect(ctx.engine.currentState).toBe('release');
  });
  it('keeps one stream alive while events keep arriving', () => {
    const ctx = setup(100, 10);
    for (let i = 0; i < 10; i++) {
      ctx.engine.wheel(0.1);
      ctx.clock.advance(60, 4);
    }
    expect(ctx.engine.currentState).toBe('drag');
    expect(ctx.engine.currentPosition).toBeCloseTo(11, 9);
  });
  it('a moveTo during a wheel stream wins over the stream ending', () => {
    const ctx = setup(100, 10);
    ctx.engine.wheel(0.2);
    ctx.engine.moveTo(40);
    ctx.clock.advance(6000);
    expect(ctx.engine.currentPosition).toBe(40);
    expect(ctx.rests).toEqual([40]);
  });
  it('a pointer release ends a wheel hold only once', () => {
    const ctx = setup(100, 10);
    ctx.engine.wheel(0.2);
    ctx.engine.grab();
    ctx.engine.release();
    ctx.clock.advance(3000);
    expect(ctx.rests).toHaveLength(1);
  });
  it('restarts from the shown position after the stream settles', () => {
    const ctx = setup(100, 10);
    ctx.engine.wheel(0.4);
    ctx.clock.advance(2000);
    expect(ctx.engine.currentPosition).toBe(10);
    ctx.engine.wheel(0.4);
    expect(ctx.engine.currentPosition).toBeCloseTo(10.4, 9);
  });
});
