begin;
-- Existing physical measurements remain metric at the database boundary so older binaries coexist.
alter table public.users add column lifestyle_survey jsonb;
alter table public.users add constraint users_lifestyle_survey_object check (lifestyle_survey is null or (jsonb_typeof(lifestyle_survey) = 'object' and octet_length(lifestyle_survey::text) <= 4096));

insert into public.gym_locations(slug,name) values ('livingston','Livingston Recreation Center') on conflict (slug) do nothing;

create table public.workout_routines (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  exercise_ids uuid[] not null check (cardinality(exercise_ids) between 1 and 30),
  created_at timestamptz not null default now()
);
create index workout_routines_owner_idx on public.workout_routines(user_id);
alter table public.workout_routines enable row level security;
revoke all on public.workout_routines from public, anon, authenticated;
grant select, insert, delete on public.workout_routines to authenticated;
grant all on public.workout_routines to service_role;
create policy routines_select on public.workout_routines for select to authenticated using (user_id = (select auth.uid()));
create policy routines_insert on public.workout_routines for insert to authenticated with check (user_id = (select auth.uid()));
create policy routines_delete on public.workout_routines for delete to authenticated using (user_id = (select auth.uid()));
-- Invoker visibility prevents referencing another user's private exercise.
create function public.validate_routine_exercises() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (select count(*) from public.exercises where id = any(new.exercise_ids) and not is_archived) <> cardinality(new.exercise_ids) then
    raise exception 'Routine exercises must be distinct, active and accessible' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_routine_exercises() from public, anon, authenticated;
create trigger routine_exercises_check before insert on public.workout_routines for each row execute function public.validate_routine_exercises();

insert into public.exercises(id,name,movement_pattern,equipment,primary_muscle,variation_notes) values
('10000000-0000-4000-8000-000000000009','Barbell Bench Press','horizontal_push','barbell','chest','Lie on a stable bench with feet supported. Lower toward the chest with forearms under the load, then press upward without bouncing. '),
('10000000-0000-4000-8000-000000000010','Incline Barbell Bench Press','horizontal_push','barbell','chest','Lie on a stable bench with feet supported. Lower toward the chest with forearms under the load, then press upward without bouncing. Use a low incline so the shoulder stays comfortable.'),
('10000000-0000-4000-8000-000000000011','Incline Dumbbell Press','horizontal_push','dumbbell','chest','Lie on a stable bench with feet supported. Lower toward the chest with forearms under the load, then press upward without bouncing. Use a low incline so the shoulder stays comfortable.'),
('10000000-0000-4000-8000-000000000012','Dumbbell Floor Press','horizontal_push','dumbbell','chest','Lie on a stable bench with feet supported. Lower toward the chest with forearms under the load, then press upward without bouncing. '),
('10000000-0000-4000-8000-000000000013','Close-Grip Bench Press','horizontal_push','free weight','chest','Lie on a stable bench with feet supported. Lower toward the chest with forearms under the load, then press upward without bouncing. '),
('10000000-0000-4000-8000-000000000014','Smith Machine Bench Press','horizontal_push','machine','chest','Lie on a stable bench with feet supported. Lower toward the chest with forearms under the load, then press upward without bouncing. '),
('10000000-0000-4000-8000-000000000015','Machine Chest Press','horizontal_push','machine','chest','Lie on a stable bench with feet supported. Lower toward the chest with forearms under the load, then press upward without bouncing. '),
('10000000-0000-4000-8000-000000000016','Push-Up','horizontal_push','bodyweight','chest','Brace your trunk in a straight line. Bend the elbows to lower your chest, then push the support away while keeping hips aligned. '),
('10000000-0000-4000-8000-000000000017','Incline Push-Up','horizontal_push','bodyweight','chest','Brace your trunk in a straight line. Bend the elbows to lower your chest, then push the support away while keeping hips aligned. Use a low incline so the shoulder stays comfortable.'),
('10000000-0000-4000-8000-000000000018','Knee Push-Up','horizontal_push','bodyweight','chest','Brace your trunk in a straight line. Bend the elbows to lower your chest, then push the support away while keeping hips aligned. Support the knees on the floor.'),
('10000000-0000-4000-8000-000000000019','Close-Grip Push-Up','horizontal_push','bodyweight','chest','Brace your trunk in a straight line. Bend the elbows to lower your chest, then push the support away while keeping hips aligned. '),
('10000000-0000-4000-8000-000000000020','Cable Chest Fly','horizontal_adduction','cable','chest','Maintain a soft elbow bend. Bring the arms together in front of the chest, then open under control without forcing the shoulder backward. '),
('10000000-0000-4000-8000-000000000021','Low-to-High Cable Fly','horizontal_adduction','cable','chest','Maintain a soft elbow bend. Bring the arms together in front of the chest, then open under control without forcing the shoulder backward. '),
('10000000-0000-4000-8000-000000000022','Pec Deck Fly','horizontal_adduction','machine','chest','Maintain a soft elbow bend. Bring the arms together in front of the chest, then open under control without forcing the shoulder backward. '),
('10000000-0000-4000-8000-000000000023','Dumbbell Fly','horizontal_adduction','dumbbell','chest','Maintain a soft elbow bend. Bring the arms together in front of the chest, then open under control without forcing the shoulder backward. '),
('10000000-0000-4000-8000-000000000024','Barbell Bent-Over Row','horizontal_pull','barbell','upper_back','Brace your trunk and reach without rounding your lower back. Pull the elbows behind you toward the ribs, pause, and extend the arms under control. '),
('10000000-0000-4000-8000-000000000025','Chest-Supported Dumbbell Row','horizontal_pull','dumbbell','upper_back','Brace your trunk and reach without rounding your lower back. Pull the elbows behind you toward the ribs, pause, and extend the arms under control. '),
('10000000-0000-4000-8000-000000000026','Single-Arm Dumbbell Row','horizontal_pull','dumbbell','upper_back','Brace your trunk and reach without rounding your lower back. Pull the elbows behind you toward the ribs, pause, and extend the arms under control. Train each side separately and keep the pelvis level.'),
('10000000-0000-4000-8000-000000000027','Seated Cable Row','horizontal_pull','cable','upper_back','Brace your trunk and reach without rounding your lower back. Pull the elbows behind you toward the ribs, pause, and extend the arms under control. '),
('10000000-0000-4000-8000-000000000028','T-Bar Row','horizontal_pull','free weight','upper_back','Brace your trunk and reach without rounding your lower back. Pull the elbows behind you toward the ribs, pause, and extend the arms under control. '),
('10000000-0000-4000-8000-000000000029','Inverted Row','horizontal_pull','bodyweight','upper_back','Brace your trunk and reach without rounding your lower back. Pull the elbows behind you toward the ribs, pause, and extend the arms under control. '),
('10000000-0000-4000-8000-000000000030','Single-Arm Cable Row','horizontal_pull','cable','upper_back','Brace your trunk and reach without rounding your lower back. Pull the elbows behind you toward the ribs, pause, and extend the arms under control. Train each side separately and keep the pelvis level.'),
('10000000-0000-4000-8000-000000000031','Machine Row','horizontal_pull','machine','upper_back','Brace your trunk and reach without rounding your lower back. Pull the elbows behind you toward the ribs, pause, and extend the arms under control. '),
('10000000-0000-4000-8000-000000000032','Wide-Grip Lat Pulldown','vertical_pull','free weight','lats','Secure the thighs under the pad. Pull the elbows down toward your sides and bring the handle toward the upper chest; return overhead without swinging. '),
('10000000-0000-4000-8000-000000000033','Supinated Lat Pulldown','vertical_pull','free weight','lats','Secure the thighs under the pad. Pull the elbows down toward your sides and bring the handle toward the upper chest; return overhead without swinging. Use a palms-toward-you grip.'),
('10000000-0000-4000-8000-000000000034','Single-Arm Cable Pulldown','vertical_pull','cable','lats','Secure the thighs under the pad. Pull the elbows down toward your sides and bring the handle toward the upper chest; return overhead without swinging. Train each side separately and keep the pelvis level.'),
('10000000-0000-4000-8000-000000000035','Close-Grip Lat Pulldown','vertical_pull','free weight','lats','Secure the thighs under the pad. Pull the elbows down toward your sides and bring the handle toward the upper chest; return overhead without swinging. '),
('10000000-0000-4000-8000-000000000036','Pull-Up','vertical_pull','bodyweight','lats','Start from a controlled hang with the shoulder girdle engaged. Pull your chest toward the bar, then lower smoothly without kicking. '),
('10000000-0000-4000-8000-000000000037','Chin-Up','vertical_pull','bodyweight','lats','Start from a controlled hang with the shoulder girdle engaged. Pull your chest toward the bar, then lower smoothly without kicking. Use a palms-toward-you grip.'),
('10000000-0000-4000-8000-000000000038','Assisted Pull-Up','vertical_pull','bodyweight','lats','Start from a controlled hang with the shoulder girdle engaged. Pull your chest toward the bar, then lower smoothly without kicking. '),
('10000000-0000-4000-8000-000000000039','Neutral-Grip Pull-Up','vertical_pull','bodyweight','lats','Start from a controlled hang with the shoulder girdle engaged. Pull your chest toward the bar, then lower smoothly without kicking. Keep palms facing each other.'),
('10000000-0000-4000-8000-000000000040','Standing Barbell Overhead Press','vertical_push','barbell','shoulders','Brace the abdomen with ribs over pelvis. Press the weight upward above the shoulders, then lower to shoulder level without arching the lower back. '),
('10000000-0000-4000-8000-000000000041','Standing Dumbbell Press','vertical_push','dumbbell','shoulders','Brace the abdomen with ribs over pelvis. Press the weight upward above the shoulders, then lower to shoulder level without arching the lower back. '),
('10000000-0000-4000-8000-000000000042','Machine Shoulder Press','vertical_push','machine','shoulders','Brace the abdomen with ribs over pelvis. Press the weight upward above the shoulders, then lower to shoulder level without arching the lower back. '),
('10000000-0000-4000-8000-000000000043','Single-Arm Dumbbell Press','vertical_push','dumbbell','shoulders','Brace the abdomen with ribs over pelvis. Press the weight upward above the shoulders, then lower to shoulder level without arching the lower back. Train each side separately and keep the pelvis level.'),
('10000000-0000-4000-8000-000000000044','Dumbbell Lateral Raise','shoulder_abduction','dumbbell','shoulders','Keep elbows slightly bent. Raise the arms out to the sides to a comfortable shoulder height, then lower slowly without shrugging or swinging. '),
('10000000-0000-4000-8000-000000000045','Cable Lateral Raise','shoulder_abduction','cable','shoulders','Keep elbows slightly bent. Raise the arms out to the sides to a comfortable shoulder height, then lower slowly without shrugging or swinging. '),
('10000000-0000-4000-8000-000000000046','Machine Lateral Raise','shoulder_abduction','machine','shoulders','Keep elbows slightly bent. Raise the arms out to the sides to a comfortable shoulder height, then lower slowly without shrugging or swinging. '),
('10000000-0000-4000-8000-000000000047','Leaning Cable Lateral Raise','shoulder_abduction','cable','shoulders','Keep elbows slightly bent. Raise the arms out to the sides to a comfortable shoulder height, then lower slowly without shrugging or swinging. '),
('10000000-0000-4000-8000-000000000048','Reverse Pec Deck','horizontal_abduction','free weight','rear_delts','Support or hinge your torso. Move the upper arms outward with a soft elbow bend, then return slowly while keeping the neck relaxed. '),
('10000000-0000-4000-8000-000000000049','Bent-Over Dumbbell Reverse Fly','horizontal_abduction','dumbbell','rear_delts','Support or hinge your torso. Move the upper arms outward with a soft elbow bend, then return slowly while keeping the neck relaxed. '),
('10000000-0000-4000-8000-000000000050','Cable Reverse Fly','horizontal_abduction','cable','rear_delts','Support or hinge your torso. Move the upper arms outward with a soft elbow bend, then return slowly while keeping the neck relaxed. '),
('10000000-0000-4000-8000-000000000051','Front Squat','squat','free weight','quadriceps','Brace your trunk. Bend hips and knees together with knees tracking the toes; lower to a controlled depth, then push through the whole foot to stand. '),
('10000000-0000-4000-8000-000000000052','Goblet Squat','squat','free weight','quadriceps','Brace your trunk. Bend hips and knees together with knees tracking the toes; lower to a controlled depth, then push through the whole foot to stand. '),
('10000000-0000-4000-8000-000000000053','Hack Squat','squat','free weight','quadriceps','Brace your trunk. Bend hips and knees together with knees tracking the toes; lower to a controlled depth, then push through the whole foot to stand. '),
('10000000-0000-4000-8000-000000000054','Smith Machine Squat','squat','machine','quadriceps','Brace your trunk. Bend hips and knees together with knees tracking the toes; lower to a controlled depth, then push through the whole foot to stand. '),
('10000000-0000-4000-8000-000000000055','Box Squat','squat','free weight','quadriceps','Brace your trunk. Bend hips and knees together with knees tracking the toes; lower to a controlled depth, then push through the whole foot to stand. '),
('10000000-0000-4000-8000-000000000056','Bodyweight Squat','squat','bodyweight','quadriceps','Brace your trunk. Bend hips and knees together with knees tracking the toes; lower to a controlled depth, then push through the whole foot to stand. '),
('10000000-0000-4000-8000-000000000057','Safety-Bar Squat','squat','free weight','quadriceps','Brace your trunk. Bend hips and knees together with knees tracking the toes; lower to a controlled depth, then push through the whole foot to stand. '),
('10000000-0000-4000-8000-000000000058','Leg Press','knee_extension','machine','quadriceps','Sit with hips and back supported. Bend the knees without rolling the pelvis, then press the platform away without locking the knees forcefully. '),
('10000000-0000-4000-8000-000000000059','Single-Leg Press','knee_extension','machine','quadriceps','Sit with hips and back supported. Bend the knees without rolling the pelvis, then press the platform away without locking the knees forcefully. Train each side separately and keep the pelvis level.'),
('10000000-0000-4000-8000-000000000060','Horizontal Leg Press','knee_extension','machine','quadriceps','Sit with hips and back supported. Bend the knees without rolling the pelvis, then press the platform away without locking the knees forcefully. '),
('10000000-0000-4000-8000-000000000061','Reverse Lunge','lunge','free weight','quadriceps','Use a stable split stance. Lower both knees while keeping the front heel grounded, then press through the front foot to return. '),
('10000000-0000-4000-8000-000000000062','Forward Lunge','lunge','free weight','quadriceps','Use a stable split stance. Lower both knees while keeping the front heel grounded, then press through the front foot to return. '),
('10000000-0000-4000-8000-000000000063','Dumbbell Split Squat','lunge','dumbbell','quadriceps','Use a stable split stance. Lower both knees while keeping the front heel grounded, then press through the front foot to return. '),
('10000000-0000-4000-8000-000000000064','Bulgarian Split Squat','lunge','free weight','quadriceps','Use a stable split stance. Lower both knees while keeping the front heel grounded, then press through the front foot to return. Rest the rear foot on a stable low bench.'),
('10000000-0000-4000-8000-000000000065','Walking Lunge','lunge','free weight','quadriceps','Use a stable split stance. Lower both knees while keeping the front heel grounded, then press through the front foot to return. '),
('10000000-0000-4000-8000-000000000066','Conventional Deadlift','hip_hinge','free weight','hamstrings','Keep the load close and spine neutral. Send the hips back with softly bent knees, then drive through the feet and extend the hips to stand. '),
('10000000-0000-4000-8000-000000000067','Sumo Deadlift','hip_hinge','free weight','hamstrings','Keep the load close and spine neutral. Send the hips back with softly bent knees, then drive through the feet and extend the hips to stand. '),
('10000000-0000-4000-8000-000000000068','Trap-Bar Deadlift','hip_hinge','free weight','hamstrings','Keep the load close and spine neutral. Send the hips back with softly bent knees, then drive through the feet and extend the hips to stand. '),
('10000000-0000-4000-8000-000000000069','Dumbbell Romanian Deadlift','hip_hinge','dumbbell','hamstrings','Keep the load close and spine neutral. Send the hips back with softly bent knees, then drive through the feet and extend the hips to stand. '),
('10000000-0000-4000-8000-000000000070','Single-Leg Romanian Deadlift','hip_hinge','free weight','hamstrings','Keep the load close and spine neutral. Send the hips back with softly bent knees, then drive through the feet and extend the hips to stand. Train each side separately and keep the pelvis level.'),
('10000000-0000-4000-8000-000000000071','Good Morning','hip_hinge','free weight','hamstrings','Keep the load close and spine neutral. Send the hips back with softly bent knees, then drive through the feet and extend the hips to stand. '),
('10000000-0000-4000-8000-000000000072','Cable Pull-Through','hip_hinge','cable','hamstrings','Keep the load close and spine neutral. Send the hips back with softly bent knees, then drive through the feet and extend the hips to stand. '),
('10000000-0000-4000-8000-000000000073','Barbell Hip Thrust','hip_extension','barbell','glutes','Set feet securely with knees bent. Extend the hips by squeezing the glutes, pause with ribs down, then lower without overextending the back. '),
('10000000-0000-4000-8000-000000000074','Glute Bridge','hip_extension','bodyweight','glutes','Set feet securely with knees bent. Extend the hips by squeezing the glutes, pause with ribs down, then lower without overextending the back. '),
('10000000-0000-4000-8000-000000000075','Single-Leg Glute Bridge','hip_extension','bodyweight','glutes','Set feet securely with knees bent. Extend the hips by squeezing the glutes, pause with ribs down, then lower without overextending the back. Train each side separately and keep the pelvis level.'),
('10000000-0000-4000-8000-000000000076','Machine Hip Thrust','hip_extension','machine','glutes','Set feet securely with knees bent. Extend the hips by squeezing the glutes, pause with ribs down, then lower without overextending the back. '),
('10000000-0000-4000-8000-000000000077','Lying Leg Curl','knee_flexion','machine','hamstrings','Align the machine axis with the knee. Keep hips supported as you curl the pad toward the body, then straighten the knee slowly. '),
('10000000-0000-4000-8000-000000000078','Standing Single-Leg Curl','knee_flexion','machine','hamstrings','Align the machine axis with the knee. Keep hips supported as you curl the pad toward the body, then straighten the knee slowly. Train each side separately and keep the pelvis level.'),
('10000000-0000-4000-8000-000000000079','Leg Extension','knee_extension','machine','quadriceps','Align the knee with the machine pivot and keep the thigh supported. Straighten the knee smoothly against the pad, then lower under control. '),
('10000000-0000-4000-8000-000000000080','Single-Leg Extension','knee_extension','machine','quadriceps','Align the knee with the machine pivot and keep the thigh supported. Straighten the knee smoothly against the pad, then lower under control. Train each side separately and keep the pelvis level.'),
('10000000-0000-4000-8000-000000000081','Seated Calf Raise','plantar_flexion','free weight','calves','Keep the ball of the foot supported. Lift the heel through a comfortable range, pause, and lower slowly without bouncing. '),
('10000000-0000-4000-8000-000000000082','Leg Press Calf Raise','plantar_flexion','free weight','calves','Keep the ball of the foot supported. Lift the heel through a comfortable range, pause, and lower slowly without bouncing. '),
('10000000-0000-4000-8000-000000000083','Single-Leg Calf Raise','plantar_flexion','free weight','calves','Keep the ball of the foot supported. Lift the heel through a comfortable range, pause, and lower slowly without bouncing. Train each side separately and keep the pelvis level.'),
('10000000-0000-4000-8000-000000000084','Barbell Curl','elbow_flexion','barbell','biceps','Keep the upper arm still and wrist stacked. Bend the elbow to bring the load up, then lower slowly without swinging the torso. '),
('10000000-0000-4000-8000-000000000085','Dumbbell Curl','elbow_flexion','dumbbell','biceps','Keep the upper arm still and wrist stacked. Bend the elbow to bring the load up, then lower slowly without swinging the torso. '),
('10000000-0000-4000-8000-000000000086','Hammer Curl','elbow_flexion','free weight','biceps','Keep the upper arm still and wrist stacked. Bend the elbow to bring the load up, then lower slowly without swinging the torso. Keep palms facing each other.'),
('10000000-0000-4000-8000-000000000087','Preacher Curl','elbow_flexion','free weight','biceps','Keep the upper arm still and wrist stacked. Bend the elbow to bring the load up, then lower slowly without swinging the torso. '),
('10000000-0000-4000-8000-000000000088','Incline Dumbbell Curl','elbow_flexion','dumbbell','biceps','Keep the upper arm still and wrist stacked. Bend the elbow to bring the load up, then lower slowly without swinging the torso. Use a low incline so the shoulder stays comfortable.'),
('10000000-0000-4000-8000-000000000089','Cable Curl','elbow_flexion','cable','biceps','Keep the upper arm still and wrist stacked. Bend the elbow to bring the load up, then lower slowly without swinging the torso. '),
('10000000-0000-4000-8000-000000000090','Concentration Curl','elbow_flexion','free weight','biceps','Keep the upper arm still and wrist stacked. Bend the elbow to bring the load up, then lower slowly without swinging the torso. '),
('10000000-0000-4000-8000-000000000091','EZ-Bar Curl','elbow_flexion','free weight','biceps','Keep the upper arm still and wrist stacked. Bend the elbow to bring the load up, then lower slowly without swinging the torso. '),
('10000000-0000-4000-8000-000000000092','Reverse Curl','elbow_flexion','free weight','biceps','Keep the upper arm still and wrist stacked. Bend the elbow to bring the load up, then lower slowly without swinging the torso. Use a palms-away grip.'),
('10000000-0000-4000-8000-000000000093','Cable Triceps Pushdown','elbow_extension','cable','triceps','Hold the upper arm steady. Straighten the elbow against resistance, then bend it under control; avoid moving the shoulder to lift the weight. '),
('10000000-0000-4000-8000-000000000094','Rope Triceps Pushdown','elbow_extension','free weight','triceps','Hold the upper arm steady. Straighten the elbow against resistance, then bend it under control; avoid moving the shoulder to lift the weight. '),
('10000000-0000-4000-8000-000000000095','Overhead Cable Triceps Extension','elbow_extension','cable','triceps','Hold the upper arm steady. Straighten the elbow against resistance, then bend it under control; avoid moving the shoulder to lift the weight. '),
('10000000-0000-4000-8000-000000000096','Dumbbell Overhead Extension','elbow_extension','dumbbell','triceps','Hold the upper arm steady. Straighten the elbow against resistance, then bend it under control; avoid moving the shoulder to lift the weight. '),
('10000000-0000-4000-8000-000000000097','Lying EZ-Bar Triceps Extension','elbow_extension','free weight','triceps','Hold the upper arm steady. Straighten the elbow against resistance, then bend it under control; avoid moving the shoulder to lift the weight. '),
('10000000-0000-4000-8000-000000000098','Single-Arm Cable Pushdown','elbow_extension','cable','triceps','Hold the upper arm steady. Straighten the elbow against resistance, then bend it under control; avoid moving the shoulder to lift the weight. Train each side separately and keep the pelvis level.'),
('10000000-0000-4000-8000-000000000099','Cable Crunch','trunk_flexion','cable','abdominals','Keep the pelvis controlled. Bring the rib cage toward the pelvis with a small trunk curl, then return slowly without pulling on the neck. '),
('10000000-0000-4000-8000-000000000100','Floor Crunch','trunk_flexion','bodyweight','abdominals','Keep the pelvis controlled. Bring the rib cage toward the pelvis with a small trunk curl, then return slowly without pulling on the neck. '),
('10000000-0000-4000-8000-000000000101','Machine Ab Crunch','trunk_flexion','machine','abdominals','Keep the pelvis controlled. Bring the rib cage toward the pelvis with a small trunk curl, then return slowly without pulling on the neck. ')
on conflict (id) do nothing;

commit;
