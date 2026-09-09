// Approximate campus building coordinates (sources in docs-phase-6.md); 150 m radii tolerate normal GPS drift. Seven regions stay below iOS's limit of 20.
export const CAMPUS_REGIONS = [
  { identifier: 'dining:busch-dining-hall', latitude: 40.52268, longitude: -74.45787 },
  { identifier: 'dining:livingston-dining-commons', latitude: 40.52289, longitude: -74.43811 },
  { identifier: 'dining:the-atrium', latitude: 40.5031, longitude: -74.4523 },
  { identifier: 'dining:neilson-dining-hall', latitude: 40.481967, longitude: -74.432114 },
  { identifier: 'gym:werblin', latitude: 40.519722, longitude: -74.460833 },
  { identifier: 'gym:college-ave', latitude: 40.5033, longitude: -74.4527 },
  { identifier: 'gym:cook-douglass', latitude: 40.478754, longitude: -74.432681 },
].map(region => ({ ...region, radius: 150, notifyOnEnter: true, notifyOnExit: true }));
export function campusRegion(identifier: string) { return CAMPUS_REGIONS.find(r => r.identifier === identifier); }
