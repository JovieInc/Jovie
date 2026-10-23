/**
 * WebGL2 hero light. Loaded only after idle, and only when the WebGL flag
 * and the device gate both allow it. The CSS poster is the look until the
 * first frame, and again if this declines to run or blows the frame budget.
 */

import {
  HERO_LIGHT_PERF,
  HERO_LIGHT_SCENE,
  nextLateFrameCount,
  sceneUnitRgb,
  shouldAbortForLateFrames,
} from './hero-light-gate';

export interface HeroLightHandle {
  stop(): void;
}

const VERTEX = `#version 300 es
in vec2 p;
out vec2 uv;
void main() {
  uv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

// One focal wash (Ion), a 1px grid that falls off with distance, and a
// hairline edge whose highlight travels the way the CSS conic roll does.
// Ultra and Pulse tint that highlight only.
const FRAGMENT = `#version 300 es
precision mediump float;
in vec2 uv;
out vec4 color;
uniform float t;
uniform vec2 res;
uniform vec2 focal;
uniform vec3 canvas;
uniform vec3 ion;
uniform vec3 ultra;
uniform vec3 pulse;
float ring(vec2 p, vec2 b) {
  vec2 q = abs(p) - b;
  return abs(length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.08);
}
void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 focus = vec2(focal.x * res.x, focal.y * res.y);
  float dist = length((px - focus) / res.y);
  float fade = exp(-dist * dist * 3.4);
  vec2 g = abs(fract(px / 64.0) - 0.5);
  float hair = 1.0 - smoothstep(0.35, 1.05, min(g.x, g.y) * 64.0);
  vec2 q = (px - focus) / res.y;
  float edge = 1.0 - smoothstep(0.0, 1.35 / res.y, ring(q, vec2(0.36, 0.22)));
  float ang = atan(q.y, q.x);
  float window = smoothstep(0.42, 0.02, abs(fract((ang - t * 0.224) / 6.2831853) - 0.5));
  vec3 hue = mix(ion, ultra, smoothstep(-0.2, 0.85, sin(t * 0.21)));
  hue = mix(hue, pulse, smoothstep(0.62, 1.0, sin(t * 0.16 + 2.1)));
  float veil = smoothstep(0.06, 0.45, uv.y);
  vec3 col = canvas;
  col += ion * fade * 0.06;
  col += ion * hair * fade * 0.14;
  col += hue * edge * window * 0.5;
  float alpha = clamp(veil * (0.42 + fade * 0.2) + edge * window * 0.75, 0.0, 0.9);
  color = vec4(col, alpha);
}`;

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

function release(gl: WebGL2RenderingContext): void {
  gl.getExtension('WEBGL_lose_context')?.loseContext();
}

/**
 * Starts the fullscreen quad. Returns null when WebGL2 is missing or would
 * use a software rasterizer (`failIfMajorPerformanceCaveat`).
 */
export function startHeroLight(
  canvas: HTMLCanvasElement,
  onFirstFrame: () => void,
  onBudgetExceeded: () => void
): HeroLightHandle | null {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    depth: false,
    failIfMajorPerformanceCaveat: true,
    powerPreference: 'low-power',
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vs || !fs || !program) {
    release(gl);
    return null;
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    release(gl);
    return null;
  }
  gl.useProgram(program);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  );
  const position = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uTime = gl.getUniformLocation(program, 't');
  const uRes = gl.getUniformLocation(program, 'res');
  const uFocal = gl.getUniformLocation(program, 'focal');
  gl.uniform3fv(
    gl.getUniformLocation(program, 'canvas'),
    sceneUnitRgb(HERO_LIGHT_SCENE.canvas)
  );
  gl.uniform3fv(
    gl.getUniformLocation(program, 'ion'),
    sceneUnitRgb(HERO_LIGHT_SCENE.ion)
  );
  gl.uniform3fv(
    gl.getUniformLocation(program, 'ultra'),
    sceneUnitRgb(HERO_LIGHT_SCENE.ultra)
  );
  gl.uniform3fv(
    gl.getUniformLocation(program, 'pulse'),
    sceneUnitRgb(HERO_LIGHT_SCENE.pulse)
  );

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(
      HERO_LIGHT_PERF.dprCap,
      globalThis.devicePixelRatio || 1
    );
    let width = Math.max(1, Math.round(rect.width * dpr));
    let height = Math.max(1, Math.round(rect.height * dpr));
    if (width * height > HERO_LIGHT_PERF.maxPixels) {
      const scale = Math.sqrt(HERO_LIGHT_PERF.maxPixels / (width * height));
      width = Math.max(1, Math.floor(width * scale));
      height = Math.max(1, Math.floor(height * scale));
    }
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.uniform2f(uRes, width, height);
    const narrow = rect.width < 1024;
    gl.uniform2f(uFocal, narrow ? 0.5 : 0.36, narrow ? 0.28 : 0.42);
  };

  let frame = 0;
  let last = 0;
  let late = 0;
  let visible = false;
  let painted = false;
  let stopped = false;
  const origin = performance.now();

  const draw = (now: number) => {
    frame = 0;
    if (stopped || !visible || document.hidden) return;
    if (last !== 0) {
      late = nextLateFrameCount(late, now - last);
      if (shouldAbortForLateFrames(late)) {
        stopped = true;
        onBudgetExceeded();
        return;
      }
    }
    last = now;
    gl.uniform1f(uTime, (now - origin) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!painted) {
      painted = true;
      onFirstFrame();
    }
    frame = requestAnimationFrame(draw);
  };

  const schedule = () => {
    if (frame === 0 && visible && !document.hidden && !stopped) {
      frame = requestAnimationFrame(draw);
    }
  };

  const intersection = new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting);
    schedule();
  });
  intersection.observe(canvas);

  const sizeObserver = new ResizeObserver(resize);
  sizeObserver.observe(canvas);
  document.addEventListener('visibilitychange', schedule);
  resize();

  return {
    stop() {
      stopped = true;
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = 0;
      visible = false;
      intersection.disconnect();
      sizeObserver.disconnect();
      document.removeEventListener('visibilitychange', schedule);
      release(gl);
    },
  };
}
