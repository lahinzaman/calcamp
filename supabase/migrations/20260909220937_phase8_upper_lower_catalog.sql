begin;
-- Shared catalogue rows only: existing ownership and RLS policies are unchanged.
insert into public.exercises(id,name,movement_pattern,equipment,primary_muscle,grip_orientation,body_position) values
('10000000-0000-4000-8000-000000000003','Dumbbell Bench Press','horizontal_push','dumbbell','chest','neutral','supine'),
('10000000-0000-4000-8000-000000000004','High-Bar Back Squat','squat','barbell','quadriceps','pronated','standing'),
('10000000-0000-4000-8000-000000000005','Romanian Deadlift','hinge','barbell','hamstrings','pronated','standing'),
('10000000-0000-4000-8000-000000000006','Seated Dumbbell Shoulder Press','vertical_push','dumbbell','shoulders','neutral','seated'),
('10000000-0000-4000-8000-000000000007','Seated Leg Curl','knee_flexion','machine','hamstrings','neutral','seated'),
('10000000-0000-4000-8000-000000000008','Standing Calf Raise','plantar_flexion','machine','calves','neutral','standing')
on conflict(id) do nothing;
commit;
