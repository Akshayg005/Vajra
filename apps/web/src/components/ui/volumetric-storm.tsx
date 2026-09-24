import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { cn } from '@/lib/utils';
import { boltPath, isCgBolt } from '@/engine/volume';
import { cloudNoiseTexture } from './cloud-noise';
import { VOL_FRAG, VOL_FRAG_MAIN, VOL_VERT } from './volumetric-storm.glsl';

export type StormMode = 'vortex' | 'cumulonimbus';
export type StormQuality = 'low' | 'high' | 'ultra';

/** primary raymarch steps and pixel budget per quality level (ultra is meant for desktop RTX-class GPUs) */
const QUALITY: Record<StormQuality, { steps: number; budget: number }> = {
  low: { steps: 72, budget: 420_000 },
  high: { steps: 128, budget: 1_100_000 },
  ultra: { steps: 200, budget: 2_400_000 },
};

const CAMERA: Record<StormMode, { pos: [number, number, number]; target: [number, number, number]; fov: number }> = {
  vortex: { pos: [0.5, 12.2, 10.2], target: [0, 0.2, 0], fov: 46 },
  cumulonimbus: { pos: [2.0, 0.55, 6.6], target: [0.6, 2.0, 0], fov: 58 },
};

function AdaptiveResolution({ budget }: { budget: number }) {
  const size = useThree((s) => s.size);
  const setDpr = useThree((s) => s.setDpr);
  useEffect(() => {
    const px = Math.max(1, size.width * size.height);
    setDpr(Math.max(0.3, Math.min(window.devicePixelRatio || 1, Math.sqrt(budget / px))));
  }, [size.width, size.height, budget, setDpr]);
  return null;
}

interface VolumeProps {
  mode: StormMode;
  intensity: number;
  growth: number;
  anvil: number;
  eye: number;
  flashRate: number;
  steps: number;
}

function Volume({ mode, intensity, growth, anvil, eye, flashRate, steps }: VolumeProps) {
  const camera = useThree((s) => s.camera);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VOL_VERT,
        fragmentShader: VOL_FRAG + VOL_FRAG_MAIN,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        uniforms: {
          uNoise: { value: cloudNoiseTexture() },
          uInvProj: { value: new THREE.Matrix4() },
          uCamWorld: { value: new THREE.Matrix4() },
          uCamPos: { value: new THREE.Vector3() },
          uSunDir: { value: new THREE.Vector3(-0.78, 0.4, 0.3).normalize() },
          uFlashPos: { value: new THREE.Vector3(0, 1, 0) },
          uTime: { value: 0 },
          uMode: { value: 0 },
          uIntensity: { value: intensity },
          uGrowth: { value: growth },
          uAnvil: { value: anvil },
          uEye: { value: eye },
          uFlash: { value: 0 },
          uSteps: { value: steps },
          uGround: { value: 0 },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  const flash = useRef({ acc: 0, k: 0, level: 0 });
  const bolt = useRef<THREE.Line>(null);
  const boltGeo = useMemo(() => new THREE.BufferGeometry(), []);

  useFrame((st, dt) => {
    const u = mat.uniforms;
    camera.updateMatrixWorld();
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uCamPos.value.copy(camera.position);
    u.uTime.value = st.clock.elapsedTime;
    u.uMode.value = mode === 'vortex' ? 0 : 1;
    u.uGround.value = mode === 'vortex' ? 0 : 1;
    u.uSteps.value = steps;
    const k = Math.min(1, dt * 1.5);
    u.uIntensity.value += (intensity - u.uIntensity.value) * k;
    u.uGrowth.value += (growth - u.uGrowth.value) * k;
    u.uAnvil.value += (anvil - u.uAnvil.value) * k;
    u.uEye.value += (eye - u.uEye.value) * k;

    // flashes follow the live flash rate (time-compressed so a demo shows several per minute)
    const f = flash.current;
    f.acc += Math.min(3, flashRate / 18) * Math.min(dt, 0.1);
    if (f.acc >= 1) {
      f.acc -= 1;
      f.k++;
      f.level = 1;
      const cg = mode === 'cumulonimbus' && isCgBolt(f.k);
      const path = boltPath(f.k, 12, cg);
      if (mode === 'vortex') {
        // in-cloud flashes in the eyewall and the inner rain bands
        const a = (f.k * 2.39996) % (Math.PI * 2);
        const r = eye * (1.25 + ((f.k * 0.618) % 1) * 2.4);
        u.uFlashPos.value.set(Math.cos(a) * r, 0.9, Math.sin(a) * r);
      } else {
        // CG channel: jagged path from just inside the cloud base (y ≈ 0.5) down to the ground (y = 0)
        const pts = path.map(([x, , z], i) => new THREE.Vector3(0.15 + x * 0.3, 0.5 * (1 - i / Math.max(1, path.length - 1)), z * 0.3));
        u.uFlashPos.value.set(pts[0].x, cg ? 0.8 : 1.6 + ((f.k * 0.37) % 1) * 1.2, pts[0].z);
        if (bolt.current) {
          boltGeo.setFromPoints(cg ? pts : []);
          bolt.current.visible = cg;
        }
      }
    }
    f.level = Math.max(0, f.level - dt * 4.5);
    const flick = f.level > 0.55 ? 1 : f.level > 0.35 ? 0.25 : f.level > 0.15 ? 0.8 : f.level;
    u.uFlash.value = flick;
    if (bolt.current) (bolt.current.material as THREE.LineBasicMaterial).opacity = flick;
  });

  return (
    <>
      <mesh material={mat} frustumCulled={false} renderOrder={-1}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      {/* @ts-expect-error three.js <line> element (not the SVG one) */}
      <line ref={bolt} geometry={boltGeo} frustumCulled={false}>
        <lineBasicMaterial color="#eef4ff" transparent opacity={0} depthTest={false} />
      </line>
    </>
  );
}

function CameraRig({ mode }: { mode: StormMode }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  useEffect(() => {
    const c = CAMERA[mode];
    camera.position.set(...c.pos);
    camera.fov = c.fov;
    camera.near = 0.05;
    camera.far = 200;
    camera.updateProjectionMatrix();
  }, [mode, camera]);
  return null;
}

export interface VolumetricStormProps {
  mode?: StormMode;
  /** 0..1 storm strength (cloud-top height, cover) */
  intensity?: number;
  /** 0..1 life-cycle maturity (cumulonimbus tower height) */
  growth?: number;
  /** 0..1+ anvil spread (cumulonimbus) */
  anvil?: number;
  /** eye radius in scene units (vortex) */
  eye?: number;
  /** flashes per minute from the engine */
  flashRate?: number;
  quality?: StormQuality;
  interactive?: boolean;
  autoRotate?: boolean;
  className?: string;
}

/**
 * Physically based volumetric storm: raymarched through tileable Perlin-Worley noise with self-shadowing,
 * multiple scattering and cloud shadows on a lit ocean or land surface. Heavy by design; `quality` scales it.
 */
export function VolumetricStorm({
  mode = 'vortex',
  intensity = 0.9,
  growth = 0.95,
  anvil = 0.9,
  eye = 1.75,
  flashRate = 24,
  quality = 'high',
  interactive = true,
  autoRotate = true,
  className,
}: VolumetricStormProps) {
  const q = QUALITY[quality];
  const cam = CAMERA[mode];
  return (
    <div className={cn('relative h-full w-full bg-[#0b1320]', className)}>
      <Canvas camera={{ position: cam.pos, fov: cam.fov, near: 0.05, far: 200 }} dpr={0.6} gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}>
        <AdaptiveResolution budget={q.budget} />
        <CameraRig mode={mode} />
        <Volume mode={mode} intensity={intensity} growth={growth} anvil={anvil} eye={eye} flashRate={flashRate} steps={q.steps} />
        <OrbitControls
          key={mode}
          target={cam.target}
          enabled={interactive}
          enablePan={false}
          enableDamping
          autoRotate={autoRotate}
          autoRotateSpeed={mode === 'vortex' ? 0.25 : 0.35}
          minDistance={mode === 'vortex' ? 6 : 4}
          maxDistance={mode === 'vortex' ? 24 : 16}
          maxPolarAngle={Math.PI / 2.08}
        />
      </Canvas>
    </div>
  );
}

export default VolumetricStorm;
