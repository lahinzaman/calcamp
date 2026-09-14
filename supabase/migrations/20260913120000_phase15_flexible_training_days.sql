begin;

-- The advanced track used to demand exactly four training days, which is an Upper/Lower
-- assumption rather than a fact about how people train. Three-day full body, five- and
-- six-day splits, and a single weekly session are all legitimate; the calorie split now
-- works from whatever the schedule is, so the check only has to insist the schedule exists.
alter table public.users drop constraint onboarding_profile_complete;
alter table public.users
  add constraint onboarding_profile_complete check (onboarding_completed_at is null or
    (height_cm is not null and weight_kg is not null and activity_level is not null and goal is not null
      and (not is_advanced_track or cardinality(training_days) between 1 and 7)));

comment on column public.users.training_days is
  'Local weekday numbers, Sunday=0. Advanced track needs one to seven distinct days; the Upper/Lower names cycle over however many are chosen.';

commit;
