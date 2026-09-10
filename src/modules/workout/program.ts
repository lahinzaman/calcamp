export const LIFTS = {
  row: { id: '10000000-0000-4000-8000-000000000001', name: 'High-Pronated Grip Row', grip: 'pronated', equipment: 'cable' },
  pulldown: { id: '10000000-0000-4000-8000-000000000002', name: 'Neutral Grip Lat Pulldown', grip: 'neutral', equipment: 'cable' },
  bench: { id: '10000000-0000-4000-8000-000000000003', name: 'Dumbbell Bench Press', grip: 'neutral', equipment: 'dumbbell' },
  squat: { id: '10000000-0000-4000-8000-000000000004', name: 'High-Bar Back Squat', grip: 'pronated', equipment: 'barbell' },
  hinge: { id: '10000000-0000-4000-8000-000000000005', name: 'Romanian Deadlift', grip: 'pronated', equipment: 'barbell' },
  press: { id: '10000000-0000-4000-8000-000000000006', name: 'Seated Dumbbell Shoulder Press', grip: 'neutral', equipment: 'dumbbell' },
  curl: { id: '10000000-0000-4000-8000-000000000007', name: 'Seated Leg Curl', grip: 'neutral', equipment: 'machine' },
  calves: { id: '10000000-0000-4000-8000-000000000008', name: 'Standing Calf Raise', grip: 'neutral', equipment: 'machine' },
} as const;
export const PROGRAM = [
  { name: 'Upper A', focus: 'Horizontal push / pull', lifts: [LIFTS.row, LIFTS.bench, LIFTS.pulldown] },
  { name: 'Lower A', focus: 'Squat emphasis', lifts: [LIFTS.squat, LIFTS.curl, LIFTS.calves] },
  { name: 'Upper B', focus: 'Vertical push / pull', lifts: [LIFTS.pulldown, LIFTS.press, LIFTS.row] },
  { name: 'Lower B', focus: 'Hinge emphasis', lifts: [LIFTS.hinge, LIFTS.squat, LIFTS.curl] },
] as const;
