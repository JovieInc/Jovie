import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HERO_LIGHT_PERF } from './hero-light-gate';
import { startHeroLight } from './hero-light-gl';

interface FakeGlOptions {
  readonly compiles?: boolean;
  readonly links?: boolean;
}

function fakeGl({ compiles = true, links = true }: FakeGlOptions = {}) {
  const loseContext = vi.fn();
  return {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    STATIC_DRAW: 6,
    FLOAT: 7,
    TRIANGLES: 8,
    BLEND: 9,
    SRC_ALPHA: 10,
    ONE_MINUS_SRC_ALPHA: 11,
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => compiles),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => links),
    useProgram: vi.fn(),
    enable: vi.fn(),
    blendFunc: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    getUniformLocation: vi.fn((_program: unknown, name: string) => name),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    uniform3fv: vi.fn(),
    viewport: vi.fn(),
    drawArrays: vi.fn(),
    getExtension: vi.fn(() => ({ loseContext })),
    loseContext,
  };
}

type FakeGl = ReturnType<typeof fakeGl>;

let intersect: (isIntersecting: boolean) => void;
let rafQueue: Map<number, FrameRequestCallback>;
let nextRaf: number;

function canvasWith(
  gl: FakeGl | null,
  rect = { width: 1440, height: 800 }
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.getContext = vi.fn(() => gl) as never;
  canvas.getBoundingClientRect = () => rect as DOMRect;
  return canvas;
}

function runFrame(now: number) {
  const pending = [...rafQueue.entries()];
  rafQueue.clear();
  for (const [, callback] of pending) callback(now);
}

beforeEach(() => {
  rafQueue = new Map();
  nextRaf = 1;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextRaf++;
    rafQueue.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafQueue.delete(id);
  });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersect = isIntersecting =>
          callback(
            [{ isIntersecting } as IntersectionObserverEntry],
            this as never
          );
      }
      observe() {}
      disconnect() {}
    }
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.stubGlobal('devicePixelRatio', 2);
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    value: false,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('startHeroLight', () => {
  it('asks for a low-power hardware context and declines without one', () => {
    const canvas = canvasWith(null);

    expect(startHeroLight(canvas, vi.fn(), vi.fn())).toBeNull();
    expect(canvas.getContext).toHaveBeenCalledWith(
      'webgl2',
      expect.objectContaining({
        alpha: true,
        failIfMajorPerformanceCaveat: true,
        powerPreference: 'low-power',
      })
    );
  });

  it('caps resolution at 1x and the pixel budget', () => {
    const gl = fakeGl();
    const canvas = canvasWith(gl, { width: 1440, height: 800 });
    startHeroLight(canvas, vi.fn(), vi.fn());

    expect([canvas.width, canvas.height]).toEqual([1440, 800]);
    expect(gl.uniform2f).toHaveBeenCalledWith('focal', 0.36, 0.42);

    const huge = canvasWith(fakeGl(), { width: 4000, height: 2000 });
    startHeroLight(huge, vi.fn(), vi.fn());
    expect(huge.width * huge.height).toBeLessThanOrEqual(
      HERO_LIGHT_PERF.maxPixels
    );
  });

  it('uses the narrow focal point under 1024px', () => {
    const gl = fakeGl();
    startHeroLight(
      canvasWith(gl, { width: 390, height: 700 }),
      vi.fn(),
      vi.fn()
    );
    expect(gl.uniform2f).toHaveBeenCalledWith('focal', 0.5, 0.28);
  });

  it('drops WebGL after eight late frames and keeps earlier frames', () => {
    const gl = fakeGl();
    const onFirstFrame = vi.fn();
    const onBudgetExceeded = vi.fn();
    startHeroLight(canvasWith(gl), onFirstFrame, onBudgetExceeded);
    intersect(true);

    let now = 1_000;
    runFrame(now);
    expect(onFirstFrame).toHaveBeenCalledTimes(1);

    for (let i = 0; i < HERO_LIGHT_PERF.lateFrameLimit; i += 1) {
      now += HERO_LIGHT_PERF.maxFrameMs + 5;
      runFrame(now);
    }

    expect(onBudgetExceeded).toHaveBeenCalledTimes(1);
    expect(gl.drawArrays).toHaveBeenCalledTimes(HERO_LIGHT_PERF.lateFrameLimit);
    expect(rafQueue.size).toBe(0);
  });
});
