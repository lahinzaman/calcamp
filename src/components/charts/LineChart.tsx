import { useMemo } from 'react';
import { View } from 'react-native';
import { Svg, Circle, Line, Path } from 'react-native-svg';
import { Text } from '../../theme/primitives';
import { useThemeStore } from '../../theme/store';
import { palettes } from '../../theme/palette';
export interface Series { date: string; value: number }
/** Catmull-Rom to cubic Bézier: a readable trend line without an external charting dependency. */
function smoothPath(points: { x: number; y: number }[]) {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]; const p1 = points[i]; const p2 = points[i + 1]; const p3 = points[i + 2] ?? p2;
    d += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6}, ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6}, ${p2.x} ${p2.y}`;
  }
  return d;
}
export function LineChart({ raw, trend, height = 190, tone = 'protein', unit = '', caption }: {
  raw?: Series[]; trend: Series[]; height?: number; tone?: 'protein' | 'carbs' | 'fat'; unit?: string; caption?: string;
}) {
  const mode = useThemeStore(s => s.mode); const palette = palettes[mode];
  const width = 320; const pad = { left: 6, right: 6, top: 12, bottom: 18 };
  const model = useMemo(() => {
    const all = [...(raw ?? []), ...trend];
    if (trend.length < 2) return null;
    const values = all.map(p => p.value);
    let min = Math.min(...values); let max = Math.max(...values);
    if (max - min < 1e-6) { min -= 1; max += 1; }
    const span = max - min; min -= span * .12; max += span * .12;
    const days = trend.map(p => Date.parse(`${p.date}T00:00:00Z`));
    const first = Math.min(...days); const last = Math.max(...days);
    const range = last - first || 1;
    const project = (point: Series) => ({
      x: pad.left + (Date.parse(`${point.date}T00:00:00Z`) - first) / range * (width - pad.left - pad.right),
      y: pad.top + (1 - (point.value - min) / (max - min)) * (height - pad.top - pad.bottom),
    });
    return { min, max, trendPoints: trend.map(project), rawPoints: (raw ?? []).map(project) };
  }, [raw, trend, height]);
  if (!model) return <View className="rounded-2xl bg-raised p-5"><Text className="text-sm">Not enough data yet to draw a trend. Keep logging — this fills in as you go.</Text></View>;
  const last = model.trendPoints[model.trendPoints.length - 1];
  const latest = trend[trend.length - 1];
  return <View>
    <View className="flex-row items-baseline justify-between">
      <Text className="text-3xl font-bold">{Number(latest.value.toFixed(1))}{unit}</Text>
      <Text className="text-sm">{Number(model.max.toFixed(1))} / {Number(model.min.toFixed(1))}{unit}</Text>
    </View>
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} accessibilityLabel={caption ?? 'Trend chart'}>
      {[0, .5, 1].map(fraction => <Line key={fraction} x1={pad.left} x2={width - pad.right}
        y1={pad.top + fraction * (height - pad.top - pad.bottom)} y2={pad.top + fraction * (height - pad.top - pad.bottom)}
        stroke={palette.border} strokeWidth={1} strokeDasharray="3 5" />)}
      {model.rawPoints.map((point, i) => <Circle key={i} cx={point.x} cy={point.y} r={2.4} fill={palette.border} />)}
      <Path d={smoothPath(model.trendPoints)} fill="none" stroke={palette[tone]} strokeWidth={2.5} strokeLinecap="round" />
      <Circle cx={last.x} cy={last.y} r={5} fill={palette[tone]} />
      <Circle cx={last.x} cy={last.y} r={9} fill={palette[tone]} opacity={.22} />
    </Svg>
    {caption && <Text className="text-sm">{caption}</Text>}
  </View>;
}
/** Compact bars for day-over-day totals against a target. */
export function BarChart({ series, target, height = 150, tone = 'carbs' }: { series: Series[]; target?: number | null; height?: number; tone?: 'protein' | 'carbs' | 'fat' }) {
  const mode = useThemeStore(s => s.mode); const palette = palettes[mode];
  if (!series.length) return <View className="rounded-2xl bg-raised p-5"><Text className="text-sm">No days logged in this range yet.</Text></View>;
  const width = 320; const max = Math.max(...series.map(s => s.value), target ?? 0) * 1.1 || 1;
  const slot = width / series.length; const barWidth = Math.max(3, Math.min(18, slot - 4));
  return <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} accessibilityLabel="Daily totals">
    {target ? <Line x1={0} x2={width} y1={height - target / max * height} y2={height - target / max * height} stroke={palette.ink} strokeWidth={1} strokeDasharray="4 4" opacity={.5} /> : null}
    {series.map((point, i) => {
      const barHeight = Math.max(2, point.value / max * height);
      return <Path key={point.date} d={`M ${i * slot + (slot - barWidth) / 2} ${height} v ${-barHeight} h ${barWidth} v ${barHeight} Z`}
        fill={target && point.value > target ? palette.fat : palette[tone]} opacity={i === series.length - 1 ? 1 : .75} />;
    })}
  </Svg>;
}
