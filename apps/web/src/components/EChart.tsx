import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart, ScatterChart } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([LineChart, BarChart, ScatterChart, HeatmapChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, VisualMapComponent, CanvasRenderer]);

export const AXIS = {
  axisLine: { lineStyle: { color: '#334155' } },
  axisLabel: { color: '#94a3b8', fontFamily: 'JetBrains Mono', fontSize: 11 },
  splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } },
  nameTextStyle: { color: '#94a3b8' },
};

/** Thin ECharts wrapper: updates options in place (no re-mount), eased transitions. */
export function EChart({ option, height = 240, className }: { option: echarts.EChartsCoreOption; height?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts | null>(null);
  useEffect(() => {
    inst.current = echarts.init(ref.current!, undefined, { renderer: 'canvas' });
    const ro = new ResizeObserver(() => inst.current?.resize());
    ro.observe(ref.current!);
    return () => {
      ro.disconnect();
      inst.current?.dispose();
    };
  }, []);
  useEffect(() => {
    inst.current?.setOption(
      { animationDurationUpdate: 500, animationEasingUpdate: 'cubicOut', backgroundColor: 'transparent', textStyle: { fontFamily: 'Inter' }, ...option },
      { notMerge: false, lazyUpdate: true },
    );
  }, [option]);
  return <div ref={ref} className={className} style={{ height, width: '100%' }} />;
}
