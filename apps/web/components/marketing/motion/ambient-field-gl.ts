/**
 * WebGL2 renderer for MarketingAmbientField (JOV-7757). Loaded as its own
 * chunk after the page is idle; the SSR poster carries the look until then
 * and on every device this declines to run on.
 *
 * One accent, one focal bloom, slow low-frequency drift. Renders at half
 * resolution (the field is soft by design), capped at 30fps, and stops
 * scheduling frames while offscreen or in a hidden tab.
 */

export interface AmbientFieldColors {
  /** sRGB 0-1 of the section accent. */
  readonly accent: readonly [number, number, number];
  /** sRGB 0-1 of the surface behind the field. */
  readonly base: readonly [number, number, number];
}

export interface AmbientFieldHandle {
  stop(): void;
}

const VERTEX = `#version 300 es
in vec2 p;
out vec2 uv;
void main() {
  uv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

// Value-noise fbm, three octaves. The bloom is an ellipse anchored above
// centre; noise only modulates its edge and intensity, so the hue never
// leaves the accent (accent-rotation rule: one accent per section).
const FRAGMENT = `#version 300 es
precision mediump float;
in vec2 uv;
out vec4 color;
uniform float t;
uniform float aspect;
uniform vec3 accent;
uniform vec3 base;
float hash(vec2 q) {
  return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 q) {
  vec2 i = floor(q);
  vec2 f = fract(q);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 q) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * noise(q);
    q *= 2.03;
    a *= 0.5;
  }
  return v;
}
void main() {
  vec2 q = vec2((uv.x - 0.5) * aspect, uv.y - 1.0);
  float drift = fbm(q * 1.4 + vec2(t * 0.035, -t * 0.02));
  vec2 focal = vec2(0.0, 0.08) + 0.06 * vec2(sin(t * 0.11), cos(t * 0.07));
  vec2 d = (q - focal) * vec2(0.55, 1.0);
  float bloom = exp(-dot(d, d) * (7.5 - drift * 3.5));
  // Faint rays fanning down from the focal point: one light, from above.
  float angle = atan(d.x, -d.y);
  float rays = pow(noise(vec2(angle * 5.0, t * 0.06)), 3.0);
  float reach = exp(-length(d) * 1.6);
  float glow = bloom * (0.55 + 0.45 * drift) + rays * reach * 0.24;
  vec3 c = mix(base, accent, clamp(glow * 0.62, 0.0, 1.0));
  c += (hash(gl_FragCoord.xy + t) - 0.5) / 255.0;
  color = vec4(c, 1.0);
}`;

const RESOLUTION_SCALE = 0.5;
const MAX_PIXELS = 960 * 540;
const FRAME_INTERVAL_MS = 1000 / 30;

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

/**
 * Starts rendering into `canvas`. Returns null when WebGL2 is unavailable or
 * would run on a software rasterizer, so the caller keeps the poster.
 * `onFirstFrame` fires once the first frame is on screen.
 */
export function startAmbientField(
  canvas: HTMLCanvasElement,
  colors: AmbientFieldColors,
  onFirstFrame: () => void
): AmbientFieldHandle | null {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    failIfMajorPerformanceCaveat: true,
    powerPreference: 'low-power',
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

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
  const uAspect = gl.getUniformLocation(program, 'aspect');
  gl.uniform3fv(gl.getUniformLocation(program, 'accent'), colors.accent);
  gl.uniform3fv(gl.getUniformLocation(program, 'base'), colors.base);

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    let width = Math.max(1, Math.round(rect.width * RESOLUTION_SCALE));
    let height = Math.max(1, Math.round(rect.height * RESOLUTION_SCALE));
    const over = Math.sqrt((width * height) / MAX_PIXELS);
    if (over > 1) {
      width = Math.round(width / over);
      height = Math.round(height / over);
    }
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    gl.uniform1f(uAspect, width / height);
  };

  let frame = 0;
  let last = 0;
  let visible = false;
  let painted = false;
  const origin = performance.now();

  const draw = (now: number) => {
    frame = 0;
    if (!visible || document.hidden) return;
    if (now - last >= FRAME_INTERVAL_MS) {
      last = now;
      gl.uniform1f(uTime, (now - origin) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!painted) {
        painted = true;
        onFirstFrame();
      }
    }
    frame = requestAnimationFrame(draw);
  };

  const schedule = () => {
    if (frame === 0 && visible && !document.hidden) {
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
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = 0;
      visible = false;
      intersection.disconnect();
      sizeObserver.disconnect();
      document.removeEventListener('visibilitychange', schedule);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
