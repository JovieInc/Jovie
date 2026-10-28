import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startMatteField } from './matte-field-gl';

function fakeGl() {
  const loseContext = vi.fn();
  const uniforms = new Map<string, unknown>();
  const gl = {
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
    getShaderParameter: vi.fn(() => true),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    useProgram: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    getUniformLocation: vi.fn((_p: unknown, name: string) => name),
    uniform1f: vi.fn((name: string, v: number) => uniforms.set(name, v)),
    uniform2fv: vi.fn(),
    uniform3fv: vi.fn(),
    viewport: vi.fn(),
    drawArrays: vi.fn(),
    getExtension: vi.fn(() => ({ loseContext })),
  };
  return { gl, loseContext, uniforms };
}

let intersect: (visible: boolean) => void = () => {};
let frames: FrameRequestCallback[] = [];

beforeEach(() => {
  frames = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: (e: { isIntersecting: boolean }[]) => void) {
        intersect = v => cb([{ isIntersecting: v }]);
      }
      observe() {}
      disconnect() {}
    }
  );
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: false,
  } as MediaQueryList);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function canvasWith(gl: unknown) {
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'clientWidth', { value: 1000 });
  Object.defineProperty(canvas, 'clientHeight', { value: 600 });
  canvas.getContext = vi.fn(() => gl) as never;
  return canvas;
}

describe('startMatteField', () => {
  it('returns null without WebGL2', () => {
    expect(startMatteField(canvasWith(null))).toBeNull();
  });

  it('returns null under prefers-reduced-motion and never asks for a context', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
    } as MediaQueryList);
    const canvas = canvasWith(fakeGl().gl);
    expect(startMatteField(canvas)).toBeNull();
    expect(canvas.getContext).not.toHaveBeenCalled();
  });

  it('returns null when the shader does not compile', () => {
    const { gl } = fakeGl();
    gl.getShaderParameter.mockReturnValue(false);
    expect(startMatteField(canvasWith(gl))).toBeNull();
  });

  it('schedules nothing until visible, then draws at half resolution capped at 30fps', () => {
    const { gl, uniforms } = fakeGl();
    const canvas = canvasWith(gl);
    const first = vi.fn();
    const handle = startMatteField(canvas, {}, first);
    expect(handle).not.toBeNull();
    expect(frames).toHaveLength(0);

    intersect(true);
    expect(frames).toHaveLength(1);
    frames.shift()?.(1000);
    expect(canvas.width).toBe(500);
    expect(canvas.height).toBe(300);
    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);

    frames.shift()?.(1010);
    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
    frames.shift()?.(1040);
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    expect(uniforms.get('grain')).toBe(0.03);
    expect(uniforms.get('accentAmt')).toBe(0);
  });

  it('clamps accent strength to the allowed maximum', () => {
    const { gl, uniforms } = fakeGl();
    startMatteField(canvasWith(gl), { accentAmt: 0.9 });
    intersect(true);
    frames.shift()?.(1000);
    expect(uniforms.get('accentAmt')).toBe(0.06);
  });

  it('stops scheduling offscreen and releases the context on stop', () => {
    const { gl, loseContext } = fakeGl();
    const handle = startMatteField(canvasWith(gl));
    intersect(true);
    frames.shift()?.(1000);
    intersect(false);
    frames.shift()?.(1100);
    expect(frames).toHaveLength(0);
    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
    handle?.stop();
    expect(loseContext).toHaveBeenCalled();
  });
});
