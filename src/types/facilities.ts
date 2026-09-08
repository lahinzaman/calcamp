export const GYMS = [
  { slug: 'werblin', name: 'Sonny Werblin Recreation Center', address: '656 Bartholomew Road, Piscataway, NJ 08854' },
  { slug: 'college-ave', name: 'College Avenue Gym', address: '130 College Avenue, New Brunswick, NJ 08901' },
  { slug: 'cook-douglass', name: 'Cook/Douglass Recreation Center', address: '50 Biel Road, New Brunswick, NJ 08901' },
] as const;
export type GymSlug = typeof GYMS[number]['slug'];
export type CrowdStatus = 'Quiet' | 'Normal' | 'Packed';
export interface GymBaseline { stale?: boolean; cachedAt?: string; slug: GymSlug; baseline: number | null; checkedAt: string; status: 'available' | 'unavailable' }
export interface GymSummary { location_slug: GymSlug; vote_count: number; crowd_score: number | null; latest_vote_at: string | null }
