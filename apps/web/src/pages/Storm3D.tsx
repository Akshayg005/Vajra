import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Grid } from '@react-three/drei';
import * as THREE from 'three';
import type { StormCell } from '@vajra/contracts';
import { useStore } from '../store';
import { Z_SCALE, boltPath, isCgBolt, stormVolume } from '../engine/volume';
import { DBZ } from '../lib/colormap';
import { SeverityBadge } from '../components/SeverityBadge';
import { fx } from '../lib/format';
import { cn } from '@/lib/utils';

const VolumetricStorm = lazy(() => import('@/components/ui/volumetric-storm'));
type View = 'vortex' | 'cumulonimbus' | 'radar';
type Quality = 'low' | 'high' | 'ultra';

/** Map the engine's life cycle + echo top onto the raymarched cloud's growth / anvil controls. */
function cloudShape(c: StormCell) {
  const byTop = Math.min(1, Math.max(0.25, (c.echoTopKm - 5) / 11));
  const stageK = c.stage === 'initiation' ? 0.45 : c.stage === 'growth' ? 0.8 : c.stage === 'mature' ? 1 : 0.9;
  const anvil = c.stage === 'initiation' ? 0.1 : c.stage === 'growth' ? 0.5 : c.stage === 'mature' ? 0.95 : 1.1;
  return { growth: Math.min(1, byTop * stageK + 0.05), anvil };
}

const SPRITE = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

function dbzColor(v: number) {
  const k = Math.max(0, Math.min(255, Math.round((v / 75) * 255)));
  return new THREE.Color(DBZ.lut[k * 4] / 255, DBZ.lut[k * 4 + 1] / 255, DBZ.lut[k * 4 + 2] / 255);
}

/** Reflectivity volume as a point cloud: dBZ falls off with radius and with height above the core. */
function Volume({ c: live }: { c: StormCell }) {
  // rebuild only when the profile changes meaningfully (not on every tick)
  const ref = useRef(live);
  ref.current = live;
  const key = `${live.id}|${Math.round(live.maxDbz)}|${Math.round(live.echoTopKm * 2)}`;
  const { positions, colors } = useMemo(() => {
    void key; // rebuild trigger
    const { positions, dbz } = stormVolume(ref.current);
    const colors = new Float32Array(dbz.length * 3);
    dbz.forEach((v, i) => {
      const cc = dbzColor(v);
      colors[i * 3] = cc.r;
      colors[i * 3 + 1] = cc.g;
      colors[i * 3 + 2] = cc.b;
    });
    return { positions, colors };
  }, [key]);
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.32} map={SPRITE} alphaTest={0.01} vertexColors transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
}

function ChargeRegion({ y, r, color, label }: { y: number; r: number; color: string; label: string }) {
  return (
    <group position={[0, y, 0]}>
      <mesh>
        <sphereGeometry args={[r, 24, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.13} depthWrite={false} />
      </mesh>
      <Html center distanceFactor={14}>
        <div className="whitespace-nowrap rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white">{label}</div>
      </Html>
    </group>
  );
}

/** Jagged lightning channels; new bolts at the cell's live flash rate. */
function Bolts({ c }: { c: StormCell }) {
  const group = useRef<THREE.Group>(null);
  const acc = useRef(0);
  const seq = useRef(0);
  const bolts = useRef<{ line: THREE.Line; born: number }[]>([]);
  useFrame((st, dt) => {
    const t = st.clock.elapsedTime;
    const g = group.current;
    if (!g) return;
    // bolts per second follow the live flash rate (time-compressed so the scene stays readable)
    acc.current += Math.min(12, c.flashRate / 6) * Math.min(dt, 0.1);
    while (acc.current >= 1) {
      acc.current -= 1;
      const k = ++seq.current;
      const cg = isCgBolt(k);
      const geo = new THREE.BufferGeometry().setFromPoints(boltPath(k, c.echoTopKm, cg).map(([x, y, z]) => new THREE.Vector3(x, y, z)));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: cg ? '#e0faff' : '#a9d1ff', transparent: true, opacity: 1 }));
      g.add(line);
      bolts.current.push({ line, born: t });
    }
    bolts.current = bolts.current.filter((b) => {
      const age = t - b.born;
      (b.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, 1 - age / 0.35) * (Math.sin(age * 90) > -0.3 ? 1 : 0.3);
      if (age > 0.4) {
        g.remove(b.line);
        b.line.geometry.dispose();
        (b.line.material as THREE.Material).dispose();
        return false;
      }
      return true;
    });
  });
  return <group ref={group} />;
}

function Scene({ c }: { c: StormCell }) {
  const top = c.echoTopKm * Z_SCALE;
  const tropo = 16 * Z_SCALE;
  const overshoot = c.echoTopKm > 14.5;
  return (
    <>
      <ambientLight intensity={0.6} />
      <Grid args={[30, 30]} cellColor="#1e293b" sectionColor="#334155" fadeDistance={40} position={[0, 0, 0]} infiniteGrid />
      <Volume c={c} />
      {/* echo top plane */}
      <mesh position={[0, top, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[c.radiusKm * 0.3, c.radiusKm * 0.3 + 0.05, 64]} />
        <meshBasicMaterial color="#f5a524" />
      </mesh>
      <Html position={[c.radiusKm * 0.3 + 0.3, top, 0]} distanceFactor={14}>
        <div className="whitespace-nowrap font-mono text-[11px] text-volt">echo top {fx(c.echoTopKm)} km</div>
      </Html>
      {/* tropopause */}
      <mesh position={[0, tropo, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[14, 14]} />
        <meshBasicMaterial color="#5aa9ff" transparent opacity={0.05} side={THREE.DoubleSide} />
      </mesh>
      <Html position={[-6.5, tropo, 0]} distanceFactor={14}>
        <div className="whitespace-nowrap font-mono text-[10px] text-plasma-soft">tropopause ~16 km</div>
      </Html>
      {overshoot && (
        <mesh position={[(c.echoTopKm / c.echoTopKm) * c.radiusKm * 0.3 * 0.8, tropo, 0]}>
          <sphereGeometry args={[0.7, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshBasicMaterial color="#f5f3ff" transparent opacity={0.35} />
        </mesh>
      )}
      {/* tripole charge structure (upper +, main − at −10…−25 °C, lower +) */}
      <ChargeRegion y={top * 0.78} r={1.3} color="#ef4444" label="+ upper charge" />
      <ChargeRegion y={top * 0.5} r={1.1} color="#3b82f6" label="− main charge (−10…−25 °C)" />
      <ChargeRegion y={top * 0.22} r={0.6} color="#ef4444" label="+ lower charge" />
      <Bolts c={c} />
      <OrbitControls enableDamping target={[0, top * 0.45, 0]} maxPolarAngle={Math.PI / 2.05} autoRotate autoRotateSpeed={0.5} />
    </>
  );
}

export default function Storm3D() {
  const cells = useStore((s) => s.snap?.cells ?? []);
  const selected = useStore((s) => s.selectedCellId);
  const select = useStore((s) => s.select);
  const [local, setLocal] = useState<string | null>(null);
  const [view, setView] = useState<View>('vortex');
  const [quality, setQuality] = useState<Quality>('high');
  const strongest = [...cells].sort((a, b) => b.maxDbz - a.maxDbz);
  const c = cells.find((x) => x.id === (local ?? selected)) ?? strongest[0];
  if (!c) return <div className="p-6 text-slate-400">No storm cells right now.</div>;
  return (
    <div className="relative h-full w-full">
      {view === 'radar' ? (
        <Canvas camera={{ position: [9, 6, 11], fov: 45 }} dpr={[1, 1.75]} gl={{ antialias: true }} style={{ background: 'radial-gradient(ellipse at 50% 30%, #0f172a, #03050a)' }}>
          <Scene c={c} />
        </Canvas>
      ) : (
        <div className="absolute inset-0 bg-[#0b1320]">
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-slate-400">Building 3D cloud noise and shaders…</div>}>
            <VolumetricStorm
              mode={view}
              intensity={Math.min(1, Math.max(0.35, (c.maxDbz - 30) / 35))}
              eye={c.type === 'supercell' ? 1.45 : 1.8}
              {...cloudShape(c)}
              flashRate={c.flashRate}
              quality={quality}
              interactive
              autoRotate
            />
          </Suspense>
        </div>
      )}
      <div className="absolute right-3 top-3 flex items-center gap-2">
        <div className="flex rounded-full border border-white/10 bg-ink-900/80 p-1 text-sm backdrop-blur" role="tablist" aria-label="3D view">
          {(
            [
              ['vortex', 'Aerial vortex'],
              ['cumulonimbus', 'Cumulonimbus'],
              ['radar', 'Radar volume'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={cn('rounded-full px-3 py-1 transition', view === k ? 'bg-volt font-semibold text-ink-950' : 'text-slate-300 hover:text-white')}>
              {label}
            </button>
          ))}
        </div>
        {view !== 'radar' && (
          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value as Quality)}
            aria-label="Render quality"
            className="rounded-full border border-white/10 bg-ink-900/80 px-3 py-1.5 text-sm text-slate-200 backdrop-blur"
          >
            <option value="low">Quality: Low (laptop)</option>
            <option value="high">Quality: High</option>
            <option value="ultra">Quality: Ultra (RTX)</option>
          </select>
        )}
      </div>
      <div className="panel absolute left-3 top-3 w-[300px] p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-lg font-bold text-white">{c.id}</span>
          <SeverityBadge severity={c.severity} />
        </div>
        <div className="space-y-1">
          <div className="kv">
            <span>Max reflectivity</span>
            <span>{fx(c.maxDbz, 0)} dBZ</span>
          </div>
          <div className="kv">
            <span>Echo top</span>
            <span>{fx(c.echoTopKm)} km</span>
          </div>
          <div className="kv">
            <span>Overshooting top</span>
            <span>{c.echoTopKm > 14.5 ? 'YES' : 'no'}</span>
          </div>
          <div className="kv">
            <span>VIL</span>
            <span>{fx(c.vil, 0)} kg/m²</span>
          </div>
          <div className="kv">
            <span>Flash rate</span>
            <span>{fx(c.flashRate)} fl/min</span>
          </div>
          <div className="kv">
            <span>Cloud-top temp</span>
            <span>{fx(c.cttK, 0)} K</span>
          </div>
        </div>
        <select
          value={c.id}
          onChange={(e) => {
            setLocal(e.target.value);
            select(e.target.value);
          }}
          className="mt-3 w-full rounded-md border border-white/10 bg-ink-800 px-2 py-1 text-sm"
        >
          {strongest.map((x) => (
            <option key={x.id} value={x.id}>
              {x.id} · {Math.round(x.maxDbz)} dBZ · {x.type}
            </option>
          ))}
        </select>
        <div className="mt-2 text-[11px] text-slate-500">
          {view === 'radar'
            ? 'Vertical scale exaggerated ×5. Drag to orbit, scroll to zoom. Bolts follow the live flash rate (time-compressed).'
            : view === 'vortex'
              ? `Volumetric render (stylised, not to scale): cloud height and cover follow this cell's reflectivity and echo top; ${c.type === 'supercell' ? 'the mesocyclone tightens the eye' : 'spiral rain bands wrap a clear eye'}; in-cloud flashes follow its live flash rate. Drag to orbit, scroll to zoom.`
              : `Volumetric cumulonimbus shaped by this cell's life cycle (${c.stage}) and echo top: flat base, tower, anvil, overshooting top and rain shaft; CG strokes follow its live flash rate.`}
        </div>
      </div>
    </div>
  );
}
