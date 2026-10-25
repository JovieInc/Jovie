import {
  applyEdgeResistance,
  clamp,
  createRelease,
  DECELERATION_RATE,
  type ReleaseCurve,
  removeEdgeResistance,
  snapTarget,
  VelocityTracker,
} from './dial-physics';

export type DialState = 'idle' | 'drag' | 'release';

export interface DialScheduler {
  now(): number;
  request(callback: (time: number) => void): number;
  cancel(handle: number): void;
}

export interface DialEngineOptions {
  readonly count: number;
  readonly position?: number;
  readonly reducedMotion?: boolean;
  readonly scheduler: DialScheduler;
  /** Called with every new position; the only per-frame work. */
  readonly onFrame: (position: number, state: DialState) => void;
  /** The centered item changed (a tick for haptics and feedback). */
  readonly onIndexChange: (index: number) => void;
  /** The dial came to rest on `index`. */
  readonly onRest: (index: number) => void;
}

/** A wheel stream with no event for this long counts as lifted. */
const WHEEL_IDLE_MS = 90;

/**
 * Framework-free dial controller: velocity-tracked drag, UIScrollView-style
 * momentum, snap to the projected item, rubber-band ends and instant
 * interruption. All time comes from the injected scheduler.
 */
export class DialEngine {
  private count: number;
  private position: number;
  private state: DialState = 'idle';
  private reducedMotion: boolean;
  private anchor = 0;
  private readonly tracker = new VelocityTracker();
  private curve: ReleaseCurve | null = null;
  /** Set on the first frame so the curve shares the frame clock's origin. */
  private curveStart: number | null = null;
  private handle: number | null = null;
  private lastIndex: number;
  private wheelAt: number | null = null;
  private wheelRaw = 0;

  constructor(private readonly options: DialEngineOptions) {
    this.count = Math.max(0, options.count);
    this.reducedMotion = options.reducedMotion ?? false;
    this.position = clamp(
      options.position ?? 0,
      0,
      Math.max(0, this.count - 1)
    );
    this.lastIndex = this.index;
  }

  get index(): number {
    return clamp(Math.round(this.position), 0, Math.max(0, this.count - 1));
  }

  get currentPosition(): number {
    return this.position;
  }

  get currentState(): DialState {
    return this.state;
  }

  /** The item the dial is heading for (its rest item once it settles). */
  get targetIndex(): number {
    return this.curve ? this.curve.target : this.index;
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value;
  }

  setCount(count: number): void {
    this.count = Math.max(0, count);
    if (this.state === 'idle') {
      this.emit(clamp(this.position, 0, Math.max(0, this.count - 1)));
    }
  }

  /** Place the dial without animation (external selection changed). */
  jumpTo(index: number): void {
    if (this.state !== 'idle') return;
    this.emit(clamp(index, 0, Math.max(0, this.count - 1)));
  }

  /** Pointer down: stop any momentum on the spot and hold the dial. */
  grab(time: number = this.options.scheduler.now()): void {
    this.stopLoop();
    this.curve = null;
    this.wheelAt = null;
    this.state = 'drag';
    this.anchor = removeEdgeResistance(this.position, 0, this.maxIndex);
    this.tracker.reset();
    this.tracker.push(this.position, time);
    this.options.onFrame(this.position, this.state);
  }

  /** Pointer move: `delta` is total travel since grab, in items. */
  drag(delta: number, time: number = this.options.scheduler.now()): void {
    if (this.state !== 'drag') return;
    this.show(applyEdgeResistance(this.anchor + delta, 0, this.maxIndex), time);
  }

  /** Pointer up: throw with the measured velocity and snap. */
  release(time: number = this.options.scheduler.now()): void {
    if (this.state !== 'drag') return;
    this.settle(this.tracker.velocity(time), time);
  }

  /** Pointer cancel: settle to the nearest item without a throw. */
  cancel(time: number = this.options.scheduler.now()): void {
    if (this.state !== 'drag') return;
    this.settle(0, time);
  }

  /** Animate (or snap, with reduced motion) to `index`. */
  moveTo(index: number, time: number = this.options.scheduler.now()): void {
    const target = clamp(Math.round(index), 0, this.maxIndex);
    this.stopLoop();
    this.wheelAt = null;
    if (this.reducedMotion) {
      this.curve = null;
      this.state = 'idle';
      this.show(target, time);
      this.options.onRest(this.index);
      return;
    }
    this.startCurve(createRelease(this.position, 0, target), time);
  }

  /**
   * Programmatic throw (reveal choreography): coast from the current position
   * at `velocity` items/ms and snap to the projected item, as a finger would.
   * Ignored while a pointer holds the dial.
   */
  fling(velocity: number, time: number = this.options.scheduler.now()): void {
    if (this.state === 'drag') return;
    this.stopLoop();
    this.wheelAt = null;
    this.state = 'idle';
    this.settle(velocity, time);
  }

  /** Throw that coasts exactly to `index` (rounded and clamped). */
  flingTo(index: number, time: number = this.options.scheduler.now()): void {
    const target = clamp(Math.round(index), 0, this.maxIndex);
    const reach = DECELERATION_RATE / (1 - DECELERATION_RATE);
    this.fling((target - this.position) / reach, time);
  }

  /** Continuous input (trackpad): `delta` items since the last event. */
  wheel(delta: number, time: number = this.options.scheduler.now()): void {
    if (this.state !== 'drag' || this.wheelAt === null) {
      this.grab(time);
      this.wheelRaw = this.anchor;
      this.schedule();
    }
    // Idle detection runs on the frame clock, so stamp with it too.
    this.wheelAt = this.options.scheduler.now();
    this.wheelRaw += delta;
    this.show(applyEdgeResistance(this.wheelRaw, 0, this.maxIndex), time);
  }

  destroy(): void {
    this.stopLoop();
    this.curve = null;
    this.state = 'idle';
  }

  private get maxIndex(): number {
    return Math.max(0, this.count - 1);
  }

  private settle(velocity: number, time: number): void {
    this.wheelAt = null;
    const target = snapTarget(
      this.position,
      velocity,
      0,
      this.maxIndex,
      DECELERATION_RATE
    );
    if (this.reducedMotion) {
      this.curve = null;
      this.state = 'idle';
      this.show(target, time);
      this.options.onRest(this.index);
      return;
    }
    this.startCurve(createRelease(this.position, velocity, target), time);
  }

  private startCurve(curve: ReleaseCurve, time: number): void {
    this.curve = curve;
    this.curveStart = null;
    this.state = 'release';
    this.options.onFrame(this.position, this.state);
    this.schedule();
  }

  private show(position: number, time: number): void {
    if (this.state === 'drag') this.tracker.push(position, time);
    this.emit(position);
  }

  private emit(position: number): void {
    this.position = position;
    this.options.onFrame(position, this.state);
    const index = this.index;
    if (index !== this.lastIndex) {
      this.lastIndex = index;
      this.options.onIndexChange(index);
    }
  }

  private schedule(): void {
    if (this.handle !== null) return;
    this.handle = this.options.scheduler.request(time => {
      this.handle = null;
      this.frame(time);
    });
  }

  private stopLoop(): void {
    if (this.handle !== null) {
      this.options.scheduler.cancel(this.handle);
      this.handle = null;
    }
  }

  private frame(time: number): void {
    if (this.state === 'release' && this.curve) {
      this.curveStart ??= time;
      const step = this.curve.at(time - this.curveStart);
      this.emit(step.position);
      if (step.done) {
        this.curve = null;
        this.state = 'idle';
        this.options.onFrame(this.position, this.state);
        this.options.onRest(this.index);
        return;
      }
    } else if (this.state === 'drag' && this.wheelAt !== null) {
      if (this.options.scheduler.now() - this.wheelAt > WHEEL_IDLE_MS) {
        this.settle(0, time);
        return;
      }
    } else {
      return;
    }
    this.schedule();
  }
}
