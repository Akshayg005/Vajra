import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';
import { motion } from 'framer-motion';
import { useStore } from '../store';

const INDIA = { lat: 22.5, lng: 80 };

function latLngToVec(lat: number, lng: number, r: number) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

function Earth({ onDone }: { onDone: () => void }) {
  const tex = useLoader(THREE.TextureLoader, '/textures/earth-blue-marble.jpg');
  tex.colorSpace = THREE.SRGBColorSpace;
  const { camera } = useThree();
  const t0 = useRef<number | null>(null);
  const done = useRef(false);
  const pulses = useRef<THREE.Mesh[]>([]);
  useFrame((st) => {
    if (t0.current === null) t0.current = st.clock.elapsedTime;
    const t = st.clock.elapsedTime - t0.current;
    const k = Math.min(1, t / 5.2);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    // start far, looking at the Atlantic; swing to India while closing in
    const startLng = INDIA.lng - 150;
    const lng = startLng + (INDIA.lng - startLng) * e;
    const lat = 8 + (INDIA.lat - 8) * e;
    const dist = 5.2 - 3.55 * e;
    camera.position.copy(latLngToVec(lat, lng, dist));
    camera.lookAt(0, 0, 0);
    pulses.current.forEach((m, i) => {
      const ph = (t * 0.9 + i * 0.33) % 1;
      m.scale.setScalar(0.02 + ph * 0.12);
      (m.material as THREE.MeshBasicMaterial).opacity = (1 - ph) * Math.min(1, t / 3);
    });
    if (k >= 1 && !done.current) {
      done.current = true;
      setTimeout(onDone, 350);
    }
  });
  const spots = useMemo(
    () =>
      [
        [22.6, 88.4],
        [25.6, 85.1],
        [19.1, 72.9],
        [28.6, 77.2],
        [20.3, 85.8],
        [20.7, 77.8],
      ].map(([la, ln]) => latLngToVec(la, ln, 1.005)),
    [],
  );
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 3, 5]} intensity={1.8} />
      <mesh>
        <sphereGeometry args={[1, 96, 96]} />
        <meshStandardMaterial map={tex} roughness={0.9} metalness={0} />
      </mesh>
      <mesh scale={1.025}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.08} side={THREE.BackSide} />
      </mesh>
      {spots.map((p, i) => (
        <mesh
          key={i}
          position={p}
          ref={(m) => {
            if (m) pulses.current[i] = m;
          }}
        >
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshBasicMaterial color="#f5a524" transparent depthWrite={false} />
        </mesh>
      ))}
      <Stars radius={60} depth={30} count={3500} factor={3} fade speed={0.6} />
    </>
  );
}

/** Cinematic intro: 3D Earth zooms to India, then opens the Command Center. Skippable (click / Esc). */
export default function Intro() {
  const setDone = useStore((s) => s.setIntroDone);
  const [phase, setPhase] = useState<'globe' | 'title'>('globe');
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setDone();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [setDone]);
  useEffect(() => {
    if (phase === 'title') {
      const t = setTimeout(setDone, 1400);
      return () => clearTimeout(t);
    }
  }, [phase, setDone]);
  return (
    <motion.div className="fixed inset-0 z-[60] bg-black" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.8 } }} onClick={setDone}>
      <Canvas camera={{ position: [0, 0, 5], fov: 40 }} dpr={[1, 1.75]}>
        <Earth onDone={() => setPhase('title')} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end pb-24">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 1 }} className="text-center">
          <div className="bg-gradient-to-r from-volt via-white to-plasma bg-clip-text text-6xl font-black tracking-[0.35em] text-transparent">VAJRA</div>
          <div className="mt-2 text-sm uppercase tracking-[0.4em] text-slate-300">AI Thunderstorm & Lightning Nowcasting</div>
          <div className="mt-1 text-xs tracking-[0.3em] text-slate-500">Radar · Satellite · Lightning · NWP → 0-3 h nowcast</div>
        </motion.div>
      </div>
      <button className="absolute bottom-6 right-6 rounded-full border border-white/20 px-4 py-1.5 text-xs text-slate-300 hover:bg-white/10" onClick={setDone}>
        Skip intro ›
      </button>
    </motion.div>
  );
}
