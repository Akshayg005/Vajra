import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { cn } from '@/lib/utils';
import { boltPath, isCgBolt } from '@/engine/volume';

/**
 * Raymarched cumulonimbus: flat base, cauliflower tower, anvil sheared downwind, overshooting top and a rain shaft.
 * Self-shadowed sunlight + sky ambient; lightning flashes light the cloud from inside and CG bolts reach the ground.
 */
const VERT = `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FRAG = `
precision highp float;
varying vec3 vWorld;
uniform float uTime;
uniform float uFlash;
uniform vec3 uFlashPos;
uniform float uGrowth;
uniform vec3 uSunDir;
uniform float uAnvil;

float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float v = 0.0; float a = 0.55;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return v;
}

float fbm3(vec3 p) {
  float v = 0.0; float a = 0.55;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return v + 0.07;
}

// signed "shape" of the storm: > 0 inside
float shape(vec3 p) {
  float top = mix(0.35, 1.05, uGrowth);
  float y = p.y;
  // tower: radius grows slightly with height (cauliflower), flat base at y=-0.85
  float r = mix(0.5, 0.72, smoothstep(-0.85, top, y)) * mix(0.75, 1.0, uGrowth);
  float tower = r - length(p.xz + vec2(-0.12 * max(y, 0.0), 0.0));
  tower = min(tower, (top - y) * 2.0);
  tower = min(tower, (y + 0.85) * 3.0);
  // anvil: flat disk at the tropopause, blown downwind (+x)
  float ay = top - 0.02;
  vec2 ac = p.xz - vec2(0.55 * uAnvil, 0.0);
  float anvil = (1.55 * uAnvil + 0.2) - length(ac * vec2(0.8, 1.15));
  anvil = min(anvil, (0.16 - abs(y - ay)) * 5.0);
  // overshooting top dome above the updraft
  float dome = 0.3 * uGrowth - length(p - vec3(-0.05, top + 0.02, 0.0));
  return max(max(tower, anvil * step(0.2, uGrowth)), dome * 2.0);
}

float density(vec3 p) {
  float s = shape(p);
  if (s < -0.25) return 0.0;
  vec3 q = p * 2.2 + vec3(0.0, -uTime * 0.05, uTime * 0.012);
  float n = fbm(q);
  float d = smoothstep(-0.05, 0.25, s + (n - 0.55) * 0.55);
  // rain shaft below the base
  if (p.y < -0.8 && p.y > -1.9) {
    float rr = length(p.xz - vec2(0.1, 0.0));
    float rain = smoothstep(0.42, 0.0, rr) * (0.6 + 0.4 * noise(vec3(p.x * 18.0, p.y * 3.0 + uTime * 3.0, p.z * 18.0)));
    d = max(d, rain * 0.09 * uGrowth);
  }
  return d;
}

// cheaper density for the shadow rays (3 octaves, no rain shaft)
float densityLo(vec3 p) {
  float s = shape(p);
  if (s < -0.25) return 0.0;
  float n = fbm3(p * 2.2 + vec3(0.0, -uTime * 0.05, uTime * 0.012));
  return smoothstep(-0.05, 0.25, s + (n - 0.55) * 0.55);
}

vec2 boxHit(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax) {
  vec3 t0 = (bmin - ro) / rd; vec3 t1 = (bmax - ro) / rd;
  vec3 tmin = min(t0, t1); vec3 tmax = max(t0, t1);
  return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
}

void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorld - ro);
  vec2 h = boxHit(ro, rd, vec3(-2.4, -1.9, -2.0), vec3(2.6, 1.6, 2.0));
  if (h.x > h.y) discard;
  float t = max(h.x, 0.0);
  float stepLen = (h.y - t) / 64.0;
  vec3 col = vec3(0.0);
  float trans = 1.0;
  for (int i = 0; i < 64; i++) {
    vec3 p = ro + rd * (t + stepLen * (float(i) + hash(vWorld * 91.0)));
    float d = density(p);
    if (d > 0.002) {
      // self-shadowing toward the sun (4 taps)
      float shadow = 0.0;
      for (int j = 1; j <= 3; j++) shadow += densityLo(p + uSunDir * 0.18 * float(j));
      float sun = exp(-shadow * 2.1);
      float heightShade = smoothstep(-0.9, 1.1, p.y);
      vec3 ambient = mix(vec3(0.05, 0.07, 0.11), vec3(0.28, 0.33, 0.42), heightShade);
      vec3 sunCol = vec3(1.0, 0.7, 0.4) * 1.05; // low afternoon sun: amber rim light
      float powder = 1.0 - exp(-d * 6.0);
      vec3 lit = ambient + sunCol * sun * powder;
      // lightning: blue-white light from inside the cloud
      float fl = uFlash * exp(-length(p - uFlashPos) * 2.3);
      lit += vec3(0.75, 0.85, 1.0) * fl * 5.0;
      float a = d * stepLen * 12.4;
      col += trans * a * lit;
      trans *= exp(-a);
      if (trans < 0.02) break;
    }
  }
  gl_FragColor = vec4(col, 1.0 - trans);
}
`;

function StormVolume({ growth, anvil, flashRate }: { growth: number; anvil: number; flashRate: number }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        uniforms: {
          uTime: { value: 0 },
          uFlash: { value: 0 },
          uFlashPos: { value: new THREE.Vector3(0, 0.2, 0) },
          uGrowth: { value: growth },
          uAnvil: { value: anvil },
          uSunDir: { value: new THREE.Vector3(-0.7, 0.45, 0.35).normalize() },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const flash = useRef({ acc: 0, k: 0, level: 0 });
  const bolt = useRef<THREE.Line>(null);
  const boltGeo = useMemo(() => new THREE.BufferGeometry(), []);
  useFrame((st, dt) => {
    const u = mat.uniforms;
    u.uTime.value = st.clock.elapsedTime;
    u.uGrowth.value += (growth - u.uGrowth.value) * Math.min(1, dt * 1.5);
    u.uAnvil.value += (anvil - u.uAnvil.value) * Math.min(1, dt * 1.5);
    // deterministic flash schedule following the live flash rate (compressed for readability)
    const f = flash.current;
    f.acc += Math.min(3, flashRate / 18) * Math.min(dt, 0.1);
    if (f.acc >= 1) {
      f.acc -= 1;
      f.k++;
      f.level = 1;
      const cg = isCgBolt(f.k);
      const pts = boltPath(f.k, 12, cg).map(([x, y, z]) => new THREE.Vector3(x * 0.35, cg ? y * 0.28 - 1.85 : y * 0.2 - 0.2, z * 0.35));
      u.uFlashPos.value.set(pts[0].x, cg ? -0.2 : 0.35, pts[0].z);
      if (bolt.current) {
        boltGeo.setFromPoints(cg ? pts : []);
        bolt.current.visible = cg;
      }
    }
    // double-stroke flicker, then decay
    f.level = Math.max(0, f.level - dt * 4.5);
    const flick = f.level > 0.55 ? 1 : f.level > 0.35 ? 0.25 : f.level > 0.15 ? 0.8 : f.level;
    u.uFlash.value = flick;
    if (bolt.current) (bolt.current.material as THREE.LineBasicMaterial).opacity = flick;
  });
  return (
    <group>
      <mesh material={mat} scale={1}>
        <boxGeometry args={[5, 3.5, 4]} />
      </mesh>
      {/* @ts-expect-error three.js <line> element (not the SVG one) */}
      <line ref={bolt} geometry={boltGeo}>
        <lineBasicMaterial color="#e6f0ff" transparent opacity={0} />
      </line>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.9, 0]}>
        <circleGeometry args={[6, 64]} />
        <meshBasicMaterial color="#05080f" />
      </mesh>
    </group>
  );
}

/** Keep the raymarch at ~0.45 MP whatever the canvas size: the cloud is soft, so lower resolution is invisible but saves the GPU. */
function AdaptiveResolution({ budget = 450_000 }: { budget?: number }) {
  const size = useThree((s) => s.size);
  const setDpr = useThree((s) => s.setDpr);
  useEffect(() => {
    const px = Math.max(1, size.width * size.height);
    setDpr(Math.max(0.35, Math.min(1.25, Math.sqrt(budget / px))));
  }, [size.width, size.height, budget, setDpr]);
  return null;
}

export interface RealisticStormProps {
  /** 0..1 life-cycle maturity (tower height, anvil) */
  growth?: number;
  /** 0..1 anvil spread */
  anvil?: number;
  /** flashes per minute from the engine (drives in-cloud flashes) */
  flashRate?: number;
  interactive?: boolean;
  autoRotate?: boolean;
  className?: string;
}

export function RealisticStorm({ growth = 0.95, anvil = 0.9, flashRate = 24, interactive = false, autoRotate = true, className }: RealisticStormProps) {
  return (
    <div className={cn('relative h-full w-full', className)}>
      <Canvas camera={{ position: [0.2, 0.15, 5.2], fov: 42 }} dpr={0.6} gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}>
        <AdaptiveResolution />
        <StormVolume growth={growth} anvil={anvil} flashRate={flashRate} />
        <OrbitControls enabled={interactive} enableZoom={interactive} enablePan={false} autoRotate={autoRotate} autoRotateSpeed={0.35} minPolarAngle={Math.PI / 3} maxPolarAngle={Math.PI / 1.9} />
      </Canvas>
    </div>
  );
}

export default RealisticStorm;
