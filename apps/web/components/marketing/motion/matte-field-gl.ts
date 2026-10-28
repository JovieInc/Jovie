/**
 * Matte field: near-black depth with a slow tonal drift and fine grain.
 * WebGL2 port of the motion-language study.
 *
 * Monochrome by default (accentAmt 0). Half resolution, capped at 30fps,
 * paused offscreen and in hidden tabs. Declines (returns null) without WebGL2
 * and under prefers-reduced-motion, so the caller keeps the static fallback:
 * a CSS radial gradient plus static grain, which is the designed rest state.
 */
import { motionPresets } from '@/lib/motion/presets';

const D = motionPresets.matteField;

export interface MatteFieldOptions {
  base: readonly number[];
  accent: readonly number[];
  /** 0 to 0.06. Anything above is clamped: one small focal, never a wash. */
  accentAmt: number;
  focal: readonly number[];
  grain: number;
  drift: number;
}

export interface MatteFieldHandle {
  set(patch: Partial<MatteFieldOptions>): void;
  stop(): void;
}

const VS = `#version 300 es
in vec2 p;out vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0,1);}`;
const FS = `#version 300 es
precision mediump float;in vec2 uv;out vec4 o;
uniform float t,aspect,grain,drift,accentAmt;uniform vec3 base,accent;uniform vec2 focal;
float h(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 q){vec2 i=floor(q),f=fract(q),u=f*f*(3.-2.*f);
return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y);}
void main(){vec2 q=vec2(uv.x*aspect,uv.y);
float f=n(q*1.6+vec2(t*.012,t*.008))*.6+n(q*3.4-vec2(t*.01,0.))*.4;
float vig=smoothstep(1.25,.25,distance(uv,vec2(.5,.55)));
vec3 c=base*(1.+drift*(f-.5))*mix(.82,1.,vig);
float d=distance(vec2(uv.x*aspect,uv.y),vec2(focal.x*aspect,focal.y));
c+=accent*accentAmt*smoothstep(.45,0.,d);
float g=h(gl_FragCoord.xy+fract(t*7.)*97.)-.5;
o=vec4(c+g*grain,1);}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
}

/** Returns null when the field should not run; the static fallback stays. */
export function startMatteField(
  canvas: HTMLCanvasElement,
  opts: Partial<MatteFieldOptions> = {},
  onFirstFrame?: () => void
): MatteFieldHandle | null {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return null;
  }
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    failIfMajorPerformanceCaveat: true,
    powerPreference: 'low-power',
  });
  if (!gl) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VS);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
  const pr = gl.createProgram();
  if (!vs || !fs || !pr) return null;
  gl.attachShader(pr, vs);
  gl.attachShader(pr, fs);
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
  gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  );
  const loc = gl.getAttribLocation(pr, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const o: MatteFieldOptions = { ...D, ...opts };
  const u = (k: string) => gl.getUniformLocation(pr, k);
  const draw = (time: number) => {
    const w = Math.max(1, (canvas.clientWidth * D.resolutionScale) | 0);
    const h = Math.max(1, (canvas.clientHeight * D.resolutionScale) | 0);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    gl.uniform1f(u('t'), time);
    gl.uniform1f(u('aspect'), w / h);
    gl.uniform1f(u('grain'), o.grain);
    gl.uniform1f(u('drift'), o.drift);
    gl.uniform1f(
      u('accentAmt'),
      Math.min(D.accentMax, Math.max(0, o.accentAmt))
    );
    gl.uniform3fv(u('base'), o.base as number[]);
    gl.uniform3fv(u('accent'), o.accent as number[]);
    gl.uniform2fv(u('focal'), o.focal as number[]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const interval = 1000 / D.fpsCap;
  const origin = performance.now();
  let frame = 0;
  let last = -interval;
  let visible = false;
  let painted = false;
  const tick = (now: number) => {
    frame = 0;
    if (!visible || document.hidden) return;
    if (now - last >= interval) {
      last = now;
      draw((now - origin) / 1000);
      if (!painted) {
        painted = true;
        onFirstFrame?.();
      }
    }
    frame = requestAnimationFrame(tick);
  };
  const schedule = () => {
    if (frame === 0 && visible && !document.hidden) {
      frame = requestAnimationFrame(tick);
    }
  };
  const io = new IntersectionObserver(entries => {
    visible = entries.some(e => e.isIntersecting);
    schedule();
  });
  io.observe(canvas);
  document.addEventListener('visibilitychange', schedule);

  return {
    set: patch => Object.assign(o, patch),
    stop() {
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = 0;
      visible = false;
      io.disconnect();
      document.removeEventListener('visibilitychange', schedule);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
