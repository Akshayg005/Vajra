import { useEffect } from 'react';
import { useStore } from '../store';
export default function Intro() {
  const done = useStore((s) => s.setIntroDone);
  useEffect(() => done(), [done]);
  return null;
}
