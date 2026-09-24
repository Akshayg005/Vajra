import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface LightningProps {
  /** colour hue in degrees: 215 = storm blue, 40 = amber, 28 = ember */
  hue?: number;
  /** horizontal offset of the channel (-1..1 roughly) */
  xOffset?: number;
  speed?: number;
  intensity?: number;
  /** noise scale: bigger = more branching */
  size?: number;
  className?: string;
}

const VERT = `
attribute vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

// Lightning channel shader (Hero Odyssey, 21st.dev) - fbm-distorted bright channel with flicker.
const FRAG = `
precision mediump float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uHue;
uniform float uXOffset;
uniform float uSpeed;
uniform float uIntensity;
uniform float uSize;
#define OCTAVE_COUNT 10
vec3 hsv2rgb(vec3 c) {
  vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0,4.0,2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return c.z * mix(vec3(1.0), rgb, c.y);
}
float hash11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
mat2 rotate2d(float t) { float c = cos(t); float s = sin(t); return mat2(c, -s, s, c); }
float noise(vec2 p) {
  vec2 ip = floor(p); vec2 fp = fract(p);
  float a = hash12(ip); float b = hash12(ip + vec2(1.0, 0.0));
  float c = hash12(ip + vec2(0.0, 1.0)); float d = hash12(ip + vec2(1.0, 1.0));
  vec2 t = smoothstep(0.0, 1.0, fp);
  return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < OCTAVE_COUNT; ++i) { v += a * noise(p); p *= rotate2d(0.45); p *= 2.0; a *= 0.5; }
  return v;
}
void main() {
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  uv = 2.0 * uv - 1.0;
  uv.x *= iResolution.x / iResolution.y;
  uv.x += uXOffset;
  uv += 2.0 * fbm(uv * uSize + 0.8 * iTime * uSpeed) - 1.0;
  float dist = abs(uv.x);
  vec3 baseColor = hsv2rgb(vec3(uHue / 360.0, 0.7, 0.8));
  vec3 col = baseColor * pow(mix(0.0, 0.07, hash11(iTime * uSpeed)) / dist, 1.0) * uIntensity;
  gl_FragColor = vec4(col, 1.0);
}
`;

/**
 * WebGL lightning (from Hero Odyssey). Renders only while on screen, respects reduced motion,
 * frees its GL context on unmount and falls back to a static glow if WebGL is unavailable.
 */
export function Lightning({ hue = 215, xOffset = 0, speed = 1, intensity = 1, size = 1, className }: LightningProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const params = useRef({ hue, xOffset, speed, intensity, size });
  params.current = { hue, xOffset, speed, intensity, size };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // a fresh canvas per mount: StrictMode remounts would otherwise reuse a context we already released
    const canvas = document.createElement('canvas');
    canvas.className = 'absolute inset-0 h-full w-full mix-blend-screen';
    host.appendChild(canvas);
    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: false });
    if (!gl) {
      canvas.remove();
      return;
    }
    const compile = (src: string, type: number) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
    };
    const vs = compile(VERT, gl.VERTEX_SHADER);
    const fs = compile(FRAG, gl.FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!vs || !fs || !program) {
      canvas.remove();
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      canvas.remove();
      return;
    }
    gl.useProgram(program);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const u = (n: string) => gl.getUniformLocation(program, n);
    const loc = { res: u('iResolution'), time: u('iTime'), hue: u('uHue'), x: u('uXOffset'), speed: u('uSpeed'), int: u('uIntensity'), size: u('uSize') };

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0 });
    io.observe(canvas);
    const start = performance.now();
    let raf = 0;
    const render = (now: number) => {
      raf = requestAnimationFrame(render);
      if (!visible) return;
      // render at ~60% resolution: the channel is soft, so this saves a lot of fill-rate on laptop GPUs
      const w = Math.max(1, Math.floor(canvas.clientWidth * 0.6));
      const h = Math.max(1, Math.floor(canvas.clientHeight * 0.6));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const p = params.current;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(loc.res, w, h);
      gl.uniform1f(loc.time, reduced ? 1.7 : (now - start) / 1000);
      gl.uniform1f(loc.hue, p.hue);
      gl.uniform1f(loc.x, p.xOffset);
      gl.uniform1f(loc.speed, p.speed);
      gl.uniform1f(loc.int, p.intensity);
      gl.uniform1f(loc.size, p.size);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    };
  }, []);

  return (
    <div className={cn('relative h-full w-full overflow-hidden', className)} aria-hidden>
      {/* fallback glow if WebGL is off */}
      <div className="absolute inset-y-0 left-1/2 w-24 -translate-x-1/2 bg-[radial-gradient(closest-side,rgba(169,209,255,0.25),transparent)]" />
      <div ref={hostRef} className="absolute inset-0" />
    </div>
  );
}

export default Lightning;
