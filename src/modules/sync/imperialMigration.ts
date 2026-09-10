import { kgToLbs } from '../../lib/units';
/** Upgrade the complete account snapshot once; keep original wire patches for lost-ack retries. */
export function migrateImperialSnapshot(value: unknown): unknown {
  const data = value as Record<string, any>;
  if (!data || data.version !== 1) return value;
  const day = (d: any) => { if (d && 'bodyWeightKg' in d) { d.bodyWeightLbs = d.bodyWeightKg === null ? null : kgToLbs(d.bodyWeightKg); delete d.bodyWeightKg; } };
  const set = (s: any) => {
    for (const [old, next] of [['weightKg','weightLbs'],['estimatedOneRepMaxKg','estimatedOneRepMaxLbs']]) {
      if (old in s) { s[next] = s[old] === null ? null : kgToLbs(s[old]); delete s[old]; }
    }
  };
  const workout = (w: any) => { w?.sets?.forEach(set); };
  for (const d of Object.values(data.days ?? {})) day(d);
  workout(data.workout); data.workout?.pendingWorkouts?.forEach((p: any) => workout(p.workout));
  data.queue?.forEach((job: any) => {
    if (job.kind === 'workout') workout(job.data);
    if (job.kind === 'nutrition' && 'bodyWeightKg' in (job.data.patch ?? {})) {
      job.data.legacyMetricPatch = { ...job.data.patch }; day(job.data.patch);
    }
  });
  data.version = 2; return data;
}
