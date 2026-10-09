import{n as e}from"./rolldown-runtime-BcKkbAw3.js";function t(e,t,n){let r=e.createShader(t);return r?(e.shaderSource(r,n),e.compileShader(r),e.getShaderParameter(r,e.COMPILE_STATUS)?r:null):null}function n(e,n,c){let l=e.getContext(`webgl2`,{alpha:!1,antialias:!1,depth:!1,failIfMajorPerformanceCaveat:!0,powerPreference:`low-power`,preserveDrawingBuffer:!1});if(!l)return null;let u=t(l,l.VERTEX_SHADER,r),d=t(l,l.FRAGMENT_SHADER,i),f=l.createProgram();if(!u||!d||!f||(l.attachShader(f,u),l.attachShader(f,d),l.linkProgram(f),!l.getProgramParameter(f,l.LINK_STATUS)))return null;l.useProgram(f);let p=l.createBuffer();l.bindBuffer(l.ARRAY_BUFFER,p),l.bufferData(l.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),l.STATIC_DRAW);let m=l.getAttribLocation(f,`p`);l.enableVertexAttribArray(m),l.vertexAttribPointer(m,2,l.FLOAT,!1,0,0);let h=l.getUniformLocation(f,`t`),g=l.getUniformLocation(f,`aspect`);l.uniform3fv(l.getUniformLocation(f,`accent`),n.accent),l.uniform3fv(l.getUniformLocation(f,`base`),n.base);let _=()=>{let t=e.getBoundingClientRect(),n=Math.max(1,Math.round(t.width*a)),r=Math.max(1,Math.round(t.height*a)),i=Math.sqrt(n*r/o);i>1&&(n=Math.round(n/i),r=Math.round(r/i)),(e.width!==n||e.height!==r)&&(e.width=n,e.height=r,l.viewport(0,0,n,r)),l.uniform1f(g,n/r)},v=0,y=0,b=!1,x=!1,S=performance.now(),C=e=>{v=0,b&&!document.hidden&&(e-y>=s&&(y=e,l.uniform1f(h,(e-S)/1e3),l.drawArrays(l.TRIANGLES,0,3),x||(x=!0,c())),v=requestAnimationFrame(C))},w=()=>{v===0&&b&&!document.hidden&&(v=requestAnimationFrame(C))},T=new IntersectionObserver(e=>{b=e.some(e=>e.isIntersecting),w()});T.observe(e);let E=new ResizeObserver(_);return E.observe(e),document.addEventListener(`visibilitychange`,w),_(),{stop(){v!==0&&cancelAnimationFrame(v),v=0,b=!1,T.disconnect(),E.disconnect(),document.removeEventListener(`visibilitychange`,w),l.getExtension(`WEBGL_lose_context`)?.loseContext()}}}var r,i,a,o,s;function c(){return(c=e((()=>{r=`#version 300 es
in vec2 p;
out vec2 uv;
void main() {
  uv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`,i=`#version 300 es
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
}`,a=.5,o=518400,s=1e3/30})))()}c();export{n as startAmbientField};