import { useStore } from '../store';
import { MapView } from '../components/MapView';
import { LayerPanel, Legend } from '../components/LayerPanel';
import { TimeScrubber } from '../components/TimeScrubber';
import { DetailDrawer } from '../components/DetailDrawer';
import { EventFeed } from '../components/EventFeed';
import { CellList } from '../components/CellList';
import { ImpactStrip } from '../components/ImpactStrip';

export default function CommandCenter() {
  const detail = useStore((s) => s.detail);
  const pickMode = useStore((s) => s.pickMode);
  const frameLoading = useStore((s) => s.frameLoading);
  return (
    <div className="relative h-full w-full overflow-hidden">
      <MapView />
      {pickMode && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full border border-plasma/50 bg-plasma/20 px-4 py-1.5 text-sm font-semibold text-white shadow-violet">
          Director: click on the map to {pickMode === 'spawn' ? 'spawn a storm cell' : 'place a report'} · Esc to cancel
        </div>
      )}
      {frameLoading && <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 animate-pulse rounded-full border border-volt/40 bg-ink-900/90 px-3 py-1 font-mono text-xs text-volt">computing frame…</div>}
      <div className="pointer-events-none absolute inset-0 flex gap-3 p-3">
        <div className="scroll-thin flex flex-col gap-3 overflow-y-auto pb-24">
          <LayerPanel />
          <Legend />
          <EventFeed />
        </div>
        <div className="flex-1" />
        <div className="flex max-h-full flex-col gap-3 pb-24">{detail ? <DetailDrawer /> : <CellList />}</div>
      </div>
      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-col gap-2">
        <ImpactStrip />
        <TimeScrubber />
      </div>
    </div>
  );
}
