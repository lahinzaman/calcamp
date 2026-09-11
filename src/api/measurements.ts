import { getSupabase } from './supabase';
export const MEASUREMENT_FIELDS = [
  ['waist_in', 'Waist · in'], ['hips_in', 'Hips · in'], ['chest_in', 'Chest · in'],
  ['arm_in', 'Arm · in'], ['thigh_in', 'Thigh · in'], ['body_fat_percent', 'Body fat · %'],
] as const;
export type MeasurementField = typeof MEASUREMENT_FIELDS[number][0];
export interface BodyMeasurement extends Partial<Record<MeasurementField, number | null>> {
  id: string; measured_on: string; note: string | null;
}
function check(error: { message: string } | null) { if (error) throw Object.assign(new Error(error.message), error); }
/** Blank inputs stay null: an unmeasured circumference is unknown, not zero. */
export function measurementRow(userId: string, measurement: BodyMeasurement) {
  const row: Record<string, unknown> = { id: measurement.id, user_id: userId, measured_on: measurement.measured_on, note: measurement.note };
  for (const [field] of MEASUREMENT_FIELDS) row[field] = measurement[field] ?? null;
  return row;
}
export async function saveMeasurement(userId: string, measurement: BodyMeasurement, client = getSupabase()) {
  if (!MEASUREMENT_FIELDS.some(([field]) => typeof measurement[field] === 'number')) throw new Error('Enter at least one measurement.');
  const { error } = await client.from('body_measurements').upsert(measurementRow(userId, measurement), { onConflict: 'user_id,measured_on' });
  check(error);
}
export async function loadMeasurements(userId: string, from: string, to: string, client = getSupabase()): Promise<BodyMeasurement[]> {
  const { data, error } = await client.from('body_measurements').select('*')
    .eq('user_id', userId).gte('measured_on', from).lte('measured_on', to).order('measured_on');
  check(error);
  return (data ?? []) as BodyMeasurement[];
}
export async function deleteMeasurement(userId: string, id: string, client = getSupabase()) {
  const { error } = await client.from('body_measurements').delete().eq('id', id).eq('user_id', userId);
  check(error);
}
