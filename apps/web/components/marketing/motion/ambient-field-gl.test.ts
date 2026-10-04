import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startAmbientField } from './ambient-field-gl';

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
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => compiles),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => links),
    useProgram: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    getUniformLocation: vi.fn((_program: unknown, name: string) => name),
    uniform1f: vi.fn(),
    uniform3fv: vi.fn(),
    viewport: vi.fn(),
    drawArrays: vi.fn(),
    getExtension: vi.fn(() => ({ loseContext })),
    loseContext,
  };
}

type FakeGl = ReturnType<typeof fakeGl>;

const colors = {
  accent: [0, 0.4, 1] as const,
  base: [0, 0, 0] as const,
};

let intersect: (isIntersecting: boolean) => void;
let observerDisconnect: ReturnType<typeof vi.fn<() => void>>;
let rafQueue: Map<number, FrameRequestCallback>;
let nextRaf: number;

function canvasWith(
  gl: FakeGl | null,
  rect = { width: 1600, height: 800 }
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

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    value: hidden,
  });
}

beforeEach(() => {
  rafQueue = new Map();
  nextRaf = 1;
  observerDisconnect = vi.fn<() => void>();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextRaf++;
    rafQueue.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => rafQueue.delete(id));
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
      disconnect() {
        observerDisconnect();
      }
    }
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  setHidden(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setHidden(false);
});

describe('startAmbientField', () => {
  it('asks for a hardware context and declines software rasterizers', () => {
    const canvas = canvasWith(null);

    expect(startAmbientField(canvas, colors, vi.fn())).toBeNull();
    expect(canvas.getContext).toHaveBeenCalledWith(
      'webgl2',
      expect.objectContaining({
        failIfMajorPerformanceCaveat: true,
        powerPreference: 'low-power',
      })
    );
  });

  it.each([
    ['a shader fails to compile', { compiles: false }],
    ['the program fails to link', { links: false }],
  ] as const)('keeps the poster when %s', (_label, options) => {
    const gl = fakeGl(options);

    expect(startAmbientField(canvasWith(gl), colors, vi.fn())).toBeNull();
    expect(gl.drawArrays).not.toHaveBeenCalled();
  });

  it('renders at half resolution within the pixel cap', () => {
    const gl = fakeGl();
    const small = canvasWith(gl, { width: 800, height: 400 });
    startAmbientField(small, colors, vi.fn());

    expect([small.width, small.height]).toEqual([400, 200]);
    expect(gl.uniform1f).toHaveBeenCalledWith('aspect', 2);
    expect(gl.uniform3fv).toHaveBeenCalledWith('accent', colors.accent);

    const huge = canvasWith(fakeGl(), { width: 5120, height: 2880 });
    startAmbientField(huge, colors, vi.fn());

    expect(huge.width * huge.height).toBeLessThanOrEqual(960 * 540 + 960);
  });

  it('draws only while on screen, capped at 30fps', () => {
    const gl = fakeGl();
    const onFirstFrame = vi.fn();
    startAmbientField(canvasWith(gl), colors, onFirstFrame);

    // Offscreen: nothing is scheduled at all.
    expect(rafQueue.size).toBe(0);

    intersect(true);
    runFrame(100);
    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
    expect(onFirstFrame).toHaveBeenCalledTimes(1);

    // 16ms later is inside the 33ms frame interval: skipped, still scheduled.
    runFrame(116);
    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
    runFrame(140);
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    expect(onFirstFrame).toHaveBeenCalledTimes(1);

    intersect(false);
    runFrame(200);
    expect(rafQueue.size).toBe(0);
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
  });

  it('stops in a hidden tab and resumes when it is shown again', () => {
    const gl = fakeGl();
    startAmbientField(canvasWith(gl), colors, vi.fn());
    intersect(true);
    runFrame(100);

    setHidden(true);
    runFrame(200);
    expect(rafQueue.size).toBe(0);

    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(rafQueue.size).toBe(1);
    runFrame(300);
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
  });

  it('releases the frame loop, observers and GL context on stop', () => {
    const gl = fakeGl();
    const handle = startAmbientField(canvasWith(gl), colors, vi.fn());
    intersect(true);

    handle?.stop();

    expect(rafQueue.size).toBe(0);
    expect(observerDisconnect).toHaveBeenCalled();
    expect(gl.loseContext).toHaveBeenCalled();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(rafQueue.size).toBe(0);
  });
});
